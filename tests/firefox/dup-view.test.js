import { afterAll, beforeAll, expect, test } from 'bun:test';
import { ADDON_ID, launchFirefox, ROOT, startServer, TEST_UUID, waitFor } from './harness.js';

let ff;
let server;
let popup;

beforeAll(async () => {
  server = startServer();
  ff = await launchFirefox({ extensions: [ROOT], uuids: { [ADDON_ID]: TEST_UUID } });
  for (const p of ['/v1', '/v1?utm_source=x', '/v1#top', '/w1', '/solo']) {
    await ff.openTab(server.origin + p);
  }
  popup = await ff.openTab(`moz-extension://${TEST_UUID}/src/popup/popup.html`);
  // The tab in front is protected; make it the popup so no fixture tab is.
  await js(`browser.tabs.getCurrent().then((t) => browser.tabs.update(t.id, { active: true }))`);
});

afterAll(async () => {
  await ff?.close();
  server?.stop();
});

const js = expr => ff.evaluate(popup, expr);
const text = sel => js(`document.querySelector('${sel}').textContent.trim()`);
const hidden = sel => js(`document.querySelector('${sel}').hidden`);
const rows = () => js(`document.querySelectorAll('#list .row').length`);
const open = path =>
  js(
    `browser.tabs.query({}).then((ts) => ts.filter((t) => t.url.startsWith('${server.origin}${path}')).length)`,
  );

test('U1: the footer button counts the duplicates in this window', async () => {
  await waitFor(async () => (await text('#dups')) === 'Duplicates 2', { label: 'count of 2' });
});

test('U2: the view lists the copies to close, for this window by default', async () => {
  await ff.click(popup, '#dups');
  await waitFor(async () => (await rows()) === 2, { label: 'two rows' });
  expect(await text('#crumb-label')).toBe('Duplicates');
  expect(await text('#dup-close')).toBe('Close 2');
  expect(await hidden('#copy')).toBe(true);
  expect(await hidden('.filters')).toBe(true);
  expect(
    await js(`document.querySelector('[data-scope="window"]').getAttribute('aria-pressed')`),
  ).toBe('true');
});

test('U3: All windows also counts copies in other windows, and the choice is remembered', async () => {
  await js(
    `browser.windows.create({ url: ['${server.origin}/front', '${server.origin}/w1', '${server.origin}/v1'], focused: false }).then(() => 1)`,
  );
  await waitFor(async () => (await open('/w1')) === 2 && (await open('/v1')) === 4, {
    label: 'second window loaded',
  });
  expect(await rows()).toBe(2); // still this window only
  await ff.click(popup, '[data-scope="all"]');
  await waitFor(async () => (await rows()) === 4, { label: 'four rows' });
  expect(await text('#dup-close')).toBe('Close 4');
  expect((await js(`browser.storage.local.get('dupScope')`)).dupScope).toBe('all');
});

test('U4: Close closes exactly the listed copies and keeps the oldest of each', async () => {
  const keep = await js(
    `browser.tabs.query({ currentWindow: true }).then((ts) => ts.filter((t) => /\\/(v1|w1)/.test(t.url)).sort((a, b) => a.id - b.id).filter((t, i, all) => all.findIndex((o) => new URL(o.url).pathname === new URL(t.url).pathname) === i).map((t) => t.id))`,
  );
  await ff.click(popup, '#dup-close');
  await waitFor(async () => (await text('#toast')) === 'Closed 4 duplicates', { label: 'toast' });
  expect(await open('/v1')).toBe(1);
  expect(await open('/w1')).toBe(1);
  expect(await open('/solo')).toBe(1);
  expect(await open('/front')).toBe(1);
  const left = await js(
    `browser.tabs.query({}).then((ts) => ts.filter((t) => /\\/(v1|w1)/.test(t.url)).map((t) => t.id).sort((a, b) => a - b))`,
  );
  expect(left).toEqual(keep);
  await waitFor(async () => (await text('#empty')) === 'No duplicates to close', {
    label: 'empty state',
  });
  expect(await hidden('#dup-close')).toBe(true);
});

test('U5: protected copies stay open and are counted in a note', async () => {
  await js(
    `browser.tabs.create({ url: '${server.origin}/solo', pinned: true, active: false }).then(() => 1)`,
  );
  // One unprotected copy closes; the pinned one is the copy that stays.
  await waitFor(async () => (await rows()) === 1, { label: 'one row' });
  expect(await hidden('#dup-note')).toBe(true);
  await js(
    `browser.tabs.query({ pinned: false }).then((ts) => browser.tabs.update(ts.find((t) => t.url.endsWith('/solo')).id, { pinned: true })).then(() => 1)`,
  );
  await waitFor(async () => (await rows()) === 0 && !(await hidden('#dup-note')), {
    label: 'no rows, note shown',
  });
  expect(await text('#dup-note')).toStartWith('1 more copy stays open');
});

test('U6: back returns to the tab list', async () => {
  await ff.click(popup, '#back');
  await waitFor(async () => !(await hidden('.filters')), { label: 'filters back' });
  expect(await hidden('#scope')).toBe(true);
  expect(await hidden('#dups')).toBe(false);
  expect(await rows()).toBeGreaterThan(0);
});
