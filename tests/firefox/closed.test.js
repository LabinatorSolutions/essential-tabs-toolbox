import { afterAll, beforeAll, expect, test } from 'bun:test';
import { ADDON_ID, launchFirefox, ROOT, startServer, TEST_UUID, waitFor } from './harness.js';

let ff;
let server;
let popup;

beforeAll(async () => {
  server = startServer();
  ff = await launchFirefox({ extensions: [ROOT], uuids: { [ADDON_ID]: TEST_UUID } });
  popup = await ff.openTab(`moz-extension://${TEST_UUID}/src/popup/popup.html`);
});

afterAll(async () => {
  await ff?.close();
  server?.stop();
});

const js = expr => ff.evaluate(popup, expr);

test('an empty list says so', async () => {
  await ff.click(popup, '#closed');
  await waitFor(async () => !(await js(`document.querySelector('#empty').hidden`)), {
    label: 'empty shown',
  });
  expect(await js(`document.querySelector('#empty').textContent`)).toBe('No recently closed tabs');
  expect(await js(`document.querySelector('.filters').hidden`)).toBe(true);
  expect(await js(`document.querySelector('#crumb').hidden`)).toBe(false);
});

test('lists closed tabs newest first; Copy copies them; a click restores one', async () => {
  const a = await ff.openTab(`${server.origin}/a`);
  const b = await ff.openTab(`${server.origin}/b`);
  await ff.send('browsingContext.close', { context: a });
  await ff.send('browsingContext.close', { context: b });
  const urls = () =>
    js(
      `[...document.querySelectorAll('#list .row[data-session-id]')].map((r) => r.querySelector('i').textContent)`,
    );
  await waitFor(async () => (await urls()).length === 2, { label: 'two closed rows' });
  expect(await urls()).toEqual([`${server.origin}/b`, `${server.origin}/a`]);

  await ff.click(popup, '#copy');
  await waitFor(
    async () => (await js(`document.querySelector('#toast').textContent`)) === 'Copied 2 URLs',
    { label: 'toast' },
  );

  await ff.click(popup, '#list .row[data-session-id]:nth-child(2)');
  await waitFor(async () => (await ff.contexts()).some(c => c.url === `${server.origin}/a`), {
    label: '/a restored',
  });
});

test('Back returns to the tab list', async () => {
  // Restoring closed the popup (window.close(), as in the real toolbar popup), so open it again.
  popup = await ff.openTab(`moz-extension://${TEST_UUID}/src/popup/popup.html`);
  await ff.click(popup, '#closed');
  await waitFor(async () => (await js(`document.querySelector('.filters').hidden`)) === true, {
    label: 'closed view',
  });
  await ff.click(popup, '#back');
  await waitFor(async () => !(await js(`document.querySelector('.filters').hidden`)), {
    label: 'filters back',
  });
  expect(await js(`document.querySelectorAll('#list .row[data-tab-id]').length`)).toBeGreaterThan(
    0,
  );
});
