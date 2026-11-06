import { afterAll, beforeAll, expect, test } from 'bun:test';
import { ADDON_ID, launchFirefox, ROOT, startServer, TEST_UUID } from './harness.js';

let ff;
let server;
let page;

beforeAll(async () => {
  server = startServer();
  ff = await launchFirefox({ extensions: [ROOT], uuids: { [ADDON_ID]: TEST_UUID } });
  page = await ff.openTab(`moz-extension://${TEST_UUID}/src/popup/popup.html`);
});

afterAll(async () => {
  await ff?.close();
  server?.stop();
});

test('Sort A→Z sorts inside each tab group, keeps groups and pinned tabs in place', async () => {
  const o = server.origin;
  const result = await ff.evaluate(
    page,
    `(async () => {
      const urls = ['/pinned-z', '/d', '/z', '/y', '/b', '/e', '/c', '/a-group', '/a'].map((p) => '${o}' + p);
      const win = await browser.windows.create({ url: urls });
      const wait = () => new Promise((r) => setTimeout(r, 300));
      await wait();
      const tabs = (await browser.tabs.query({ windowId: win.id })).sort((a, b) => a.index - b.index);
      const byPath = Object.fromEntries(tabs.map((t) => [new URL(t.url).pathname, t.id]));
      await browser.tabs.update(byPath['/pinned-z'], { pinned: true });
      await browser.tabs.group({ tabIds: [byPath['/z'], byPath['/y']], createProperties: { windowId: win.id } });
      await browser.tabs.group({ tabIds: [byPath['/c'], byPath['/a-group']], createProperties: { windowId: win.id } });
      const { sortWindow } = await import('/src/popup/actions.js');
      await sortWindow(win.id);
      const after = (await browser.tabs.query({ windowId: win.id })).sort((a, b) => a.index - b.index);
      const groupIds = [...new Set(after.filter((t) => t.groupId >= 0).map((t) => t.groupId))];
      return after.map((t) => {
        const g = t.groupId >= 0 ? 'G' + (groupIds.indexOf(t.groupId) + 1) : t.pinned ? 'P' : '-';
        return g + new URL(t.url).pathname;
      });
    })()`,
  );
  // Layout before: P/pinned-z, -/d, G1/z, G1/y, -/b, -/e, G2/c, G2/a-group, -/a
  expect(result).toEqual([
    'P/pinned-z',
    '-/a',
    'G1/y',
    'G1/z',
    '-/b',
    '-/d',
    'G2/a-group',
    'G2/c',
    '-/e',
  ]);
});
