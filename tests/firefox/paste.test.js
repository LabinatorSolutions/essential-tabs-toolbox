import { afterAll, beforeAll, expect, test } from 'bun:test';
import { ADDON_ID, launchFirefox, ROOT, startServer, TEST_UUID, waitFor } from './harness.js';

let ff;
let server;
let popup;

beforeAll(async () => {
  server = startServer();
  ff = await launchFirefox({ extensions: [ROOT], uuids: { [ADDON_ID]: TEST_UUID } });
  await ff.openTab(`${server.origin}/a`);
  popup = await ff.openTab(`moz-extension://${TEST_UUID}/src/popup/popup.html`);
});

afterAll(async () => {
  await ff?.close();
  server?.stop();
});

const js = expr => ff.evaluate(popup, expr);
const setText = text =>
  js(`(() => { document.querySelector('#links').value = ${JSON.stringify(text)}; return 1; })()`);
const status = () => js(`document.querySelector('#paste-status').textContent`);
const tabsInWindow = () =>
  js(
    `browser.tabs.query({ currentWindow: true }).then((t) => t.sort((a, b) => a.index - b.index).map((x) => ({ url: x.url, active: x.active, discarded: x.discarded, cookieStoreId: x.cookieStoreId })))`,
  );

test('Open: skips open and repeated links, rejects junk, opens the rest unloaded in the background', async () => {
  const o = server.origin;
  await setText(`${o}/b\n${o}/a\nnot-a-link ${o}/b`);
  await ff.click(popup, '#open');
  await waitFor(async () => (await status()) === 'Opened 1 · 1 already open · 1 not a link', {
    label: 'status',
  });
  const tabs = await tabsInWindow();
  const b = tabs.filter(t => t.url === `${o}/b`);
  expect(b.length).toBe(1);
  expect(tabs.at(-1).url).toBe(`${o}/b`);
  expect(b[0].active).toBe(false);
  expect(b[0].discarded).toBe(true);
  const active = tabs.find(t => t.active);
  expect(b[0].cookieStoreId).toBe(active.cookieStoreId);
  expect(await js(`document.querySelector('#links').value`)).toBe('not-a-link');
});

test('Ctrl+Enter in the box opens like the Open button', async () => {
  await setText(`${server.origin}/c`);
  await ff.click(popup, '#links');
  await ff.send('input.performActions', {
    context: popup,
    actions: [
      {
        type: 'key',
        id: 'kbd',
        actions: [
          { type: 'keyDown', value: '' },
          { type: 'keyDown', value: '' },
          { type: 'keyUp', value: '' },
          { type: 'keyUp', value: '' },
        ],
      },
    ],
  });
  await waitFor(async () => (await status()) === 'Opened 1', { label: 'ctrl+enter status' });
  expect((await tabsInWindow()).some(t => t.url === `${server.origin}/c`)).toBe(true);
  expect(await js(`document.querySelector('#links').value`)).toBe('');
});

test('I3: a double click on Open opens each link once', async () => {
  const o = server.origin;
  await setText([1, 2, 3, 4, 5].map(n => `${o}/dbl${n}`).join('\n'));
  await js(
    `(() => { const b = document.querySelector('#open'); b.click(); b.click(); return 1; })()`,
  );
  await Bun.sleep(1500);
  const dbl = (await tabsInWindow()).filter(t => t.url.includes('/dbl'));
  expect(dbl.length).toBe(5);
});
