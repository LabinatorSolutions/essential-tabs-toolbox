import { afterAll, beforeAll, expect, test } from 'bun:test';
import { ADDON_ID, launchFirefox, ROOT, startServer, TEST_UUID, waitFor } from './harness.js';

let ff;
let server;
let page; // an extension page, for storage and sessions calls

const SETTLE_MS = 1500;

beforeAll(async () => {
  server = startServer();
  ff = await launchFirefox({ extensions: [ROOT], uuids: { [ADDON_ID]: TEST_UUID } });
  page = await ff.openTab(`moz-extension://${TEST_UUID}/src/popup/popup.html`);
  // Let the install-time grace period (10 s) pass, or no first load is ever checked.
  await ff.evaluate(page, `browser.storage.session.set({ graceUntil: 0 })`);
});

afterAll(async () => {
  await ff?.close();
  server?.stop();
});

const setAutoClose = on =>
  ff.evaluate(page, `browser.storage.local.set({ autoCloseDuplicates: ${on} })`);
const alive = async context => (await ff.contexts()).some(c => c.context === context);
const url = path => server.origin + path;

test('D3: off by default — opening a page twice keeps both', async () => {
  const a = await ff.openTab(url('/d3'));
  const b = await ff.openTab(url('/d3'));
  await Bun.sleep(SETTLE_MS);
  expect(await alive(a)).toBe(true);
  expect(await alive(b)).toBe(true);
});

test('D6: existing duplicates stay when the switch is turned on, even on reload', async () => {
  const a = await ff.openTab(url('/d6'));
  const b = await ff.openTab(url('/d6'));
  await Bun.sleep(SETTLE_MS); // let both first loads be handled while the switch is off
  await setAutoClose(true);
  await ff.openTab(url('/d6-other'));
  await ff.send('browsingContext.reload', { context: a, wait: 'complete' });
  await Bun.sleep(SETTLE_MS);
  expect(await alive(a)).toBe(true);
  expect(await alive(b)).toBe(true);
});

test('D1: on — opening a page again closes the older copy and keeps the new one', async () => {
  await setAutoClose(true);
  const older = await ff.openTab(url('/d1'));
  const newer = await ff.openTab(url('/d1'));
  await waitFor(async () => !(await alive(older)), { label: 'older /d1 closed' });
  expect(await alive(newer)).toBe(true);
});

test('D2: a tab navigated in place to an open page is left alone', async () => {
  await setAutoClose(true);
  const a = await ff.openTab(url('/d2'));
  const b = await ff.openTab(url('/d2-b'));
  await ff.send('browsingContext.navigate', { context: b, url: url('/d2'), wait: 'complete' });
  await Bun.sleep(SETTLE_MS);
  expect(await alive(a)).toBe(true);
  expect(await alive(b)).toBe(true);
});

test('D4: the fragment does not matter', async () => {
  await setAutoClose(true);
  const older = await ff.openTab(url('/d4#x'));
  const newer = await ff.openTab(url('/d4'));
  await waitFor(async () => !(await alive(older)), { label: 'older /d4#x closed' });
  expect(await alive(newer)).toBe(true);
});

test('D5: a different meaningful query is a different page; a tracker-only difference is not', async () => {
  await setAutoClose(true);
  const one = await ff.openTab(url('/d5?v=1'));
  const two = await ff.openTab(url('/d5?v=2'));
  await Bun.sleep(SETTLE_MS);
  expect(await alive(one)).toBe(true);
  expect(await alive(two)).toBe(true);
  const tracked = await ff.openTab(url('/d5?v=1&utm_source=mail'));
  await waitFor(async () => !(await alive(one)), { label: 'older /d5?v=1 closed' });
  expect(await alive(tracked)).toBe(true);
});

test('D7: a new tab that redirects to an open page counts as a duplicate', async () => {
  await setAutoClose(true);
  const older = await ff.openTab(url('/d7'));
  const redirected = await ff.openTab(url('/go?to=/d7'));
  await waitFor(async () => !(await alive(older)), { label: 'older /d7 closed' });
  expect(await alive(redirected)).toBe(true);
});

test('D8: a restored tab never triggers a close', async () => {
  await setAutoClose(true);
  const first = await ff.openTab(url('/d8'));
  await Bun.sleep(SETTLE_MS); // let its first load be handled (and marked) before closing it
  await ff.send('browsingContext.close', { context: first });
  const current = await ff.openTab(url('/d8'));
  await ff.evaluate(
    page,
    `browser.sessions.getRecentlyClosed().then((s) => {
      const entry = s.find((x) => x.tab && x.tab.url.endsWith('/d8'));
      return browser.sessions.restore(entry.tab.sessionId).then(() => true);
    })`,
  );
  await Bun.sleep(SETTLE_MS);
  expect(await alive(current)).toBe(true);
  const d8 = (await ff.contexts()).filter(c => c.url.endsWith('/d8'));
  expect(d8.length).toBe(2);
});
