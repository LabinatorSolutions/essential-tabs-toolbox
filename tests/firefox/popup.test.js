import { afterAll, beforeAll, expect, test } from 'bun:test';
import { ADDON_ID, launchFirefox, ROOT, startServer, TEST_UUID, waitFor } from './harness.js';

let ff;
let server;
let popup;
const POPUP = `moz-extension://${TEST_UUID}/src/popup/popup.html`;

beforeAll(async () => {
  server = startServer();
  ff = await launchFirefox({ extensions: [ROOT], uuids: { [ADDON_ID]: TEST_UUID } });
  for (const p of ['/p1', '/p2', '/p3']) await ff.openTab(server.origin + p);
  for (const p of ['/q1', '/q2']) await ff.openTab(server.altOrigin + p);
  await ff.openTab(`${server.origin}/p4`);
  popup = await ff.openTab(POPUP);
});

afterAll(async () => {
  await ff?.close();
  server?.stop();
});

const js = expr => ff.evaluate(popup, expr);
const rows = () => js(`document.querySelectorAll('#list .row').length`);

test('P1: lists every tab in the window; filter labels have no counts', async () => {
  await waitFor(async () => (await rows()) > 0, { label: 'rows rendered' });
  const windowTabs = await js(`browser.tabs.query({ currentWindow: true }).then((t) => t.length)`);
  expect(await rows()).toBe(windowTabs);
  expect(
    await js(`[...document.querySelectorAll('[data-filter]')].map((b) => b.textContent.trim())`),
  ).toEqual(['All', 'Pinned', 'Not pinned', 'By site']);
});

test('P2: By site shows sites with 2+ tabs and Other sites; footer Copy hidden', async () => {
  await ff.click(popup, '[data-filter="bySite"]');
  await waitFor(async () => (await js(`document.querySelectorAll('#list .site').length`)) > 0, {
    label: 'site rows',
  });
  expect(
    await js(`[...document.querySelectorAll('#list .site')].map((s) => s.dataset.site)`),
  ).toEqual(['127.0.0.1', 'localhost', '*other']);
  expect(
    await js(`document.querySelector('#list .site[data-site="*other"] .site-name').textContent`),
  ).toBe('Other sites');
  expect(await js(`document.querySelector('#copy').hidden`)).toBe(true);
});

test('P3: clicking a site shows only its tabs, with a back row and Copy', async () => {
  await ff.click(popup, '.site[data-site="localhost"] .site-name');
  await waitFor(async () => !(await js(`document.querySelector('#crumb').hidden`)), {
    label: 'crumb shown',
  });
  expect(await rows()).toBe(2);
  expect(await js(`document.querySelector('#copy').hidden`)).toBe(false);
});

test('P4: Copy copies the shown URLs and confirms with the count', async () => {
  await ff.click(popup, '#copy');
  await waitFor(
    async () => (await js(`document.querySelector('#toast').textContent`)) === 'Copied 2 URLs',
    {
      label: 'copied toast',
    },
  );
  expect(await js(`navigator.clipboard.readText()`)).toBe(
    `${server.altOrigin}/q1\n${server.altOrigin}/q2`,
  );
});

test('P5: the duplicate switch and the last filter survive reopening the popup', async () => {
  expect(await js(`document.querySelector('#dup-switch').getAttribute('aria-checked')`)).toBe(
    'false',
  );
  await ff.click(popup, '#dup-switch');
  await waitFor(
    async () => (await js(`browser.storage.local.get('autoCloseDuplicates')`)).autoCloseDuplicates,
    {
      label: 'setting stored',
    },
  );
  expect(await js(`document.querySelector('#dup-switch').getAttribute('aria-checked')`)).toBe(
    'true',
  );
  await ff.send('browsingContext.reload', { context: popup, wait: 'complete' });
  await waitFor(async () => (await js(`document.querySelectorAll('#list .site').length`)) > 0, {
    label: 'by-site restored',
  });
  expect(
    await js(`document.querySelector('[data-filter="bySite"]').getAttribute('aria-pressed')`),
  ).toBe('true');
  expect(await js(`document.querySelector('#dup-switch').getAttribute('aria-checked')`)).toBe(
    'true',
  );
  await ff.click(popup, '#dup-switch'); // back off for the other tests
});

test('P6: clicking the row of a tab that no longer exists removes the row without breaking', async () => {
  await ff.click(popup, '[data-filter="all"]');
  await waitFor(async () => (await rows()) > 0, { label: 'rows' });
  const before = await rows();
  await js(
    `(() => { const r = document.querySelector('#list .row'); r.dataset.tabId = '999999'; return 1; })()`,
  );
  await ff.click(popup, '#list .row[data-tab-id="999999"]');
  await waitFor(async () => (await rows()) === before - 1, { label: 'stale row removed' });
  await ff.click(popup, '[data-filter="pinned"]');
  await ff.click(popup, '[data-filter="all"]');
  expect(await rows()).toBeGreaterThan(0);
});

test('P7: a 300-tab window renders within 150 ms', async () => {
  await js(
    `Promise.all(Array.from({ length: 300 }, () => browser.tabs.create({ url: 'about:blank', active: false }))).then(() => 1)`,
  );
  await ff.send('browsingContext.reload', { context: popup, wait: 'complete' });
  const ms = await waitFor(async () => js(`document.body.dataset.renderedMs`), {
    label: 'render timing',
  });
  expect(await rows()).toBeGreaterThanOrEqual(300);
  console.log(`P7 render: ${ms} ms`);
  expect(Number(ms)).toBeLessThan(150);
});

test('I4: keyboard focus on a row survives tab updates elsewhere', async () => {
  await ff.send('browsingContext.reload', { context: popup, wait: 'complete' });
  await ff.click(popup, '[data-filter="all"]');
  await waitFor(async () => (await rows()) > 3, { label: 'rows' });
  const focused = await js(
    `(() => { const r = document.querySelectorAll('#list .row')[2]; r.focus(); return r.dataset.tabId; })()`,
  );
  // Mute a tab (not a listed property) and navigate another (a listed property).
  await js(`browser.tabs.query({ currentWindow: true }).then(async (tabs) => {
    const web = tabs.filter((t) => t.url.startsWith('http'));
    await browser.tabs.update(web[0].id, { muted: true });
    await browser.tabs.update(web[1].id, { url: web[1].url + '?moved' });
    return 1;
  })`);
  await Bun.sleep(1500);
  expect(await js(`document.activeElement?.dataset?.tabId ?? null`)).toBe(focused);
});

test('M4: a failed sort says so', async () => {
  await js(`(() => { browser.tabs.move = () => Promise.reject(new Error('gone')); return 1; })()`);
  await ff.click(popup, '#sort');
  await waitFor(
    async () => (await js(`document.querySelector('#toast').textContent`)) === 'Sort failed',
    { label: 'sort failed toast' },
  );
});
