import { afterAll, beforeAll, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchFirefox, ROOT, waitFor } from './harness.js';

const PROBE_UUID = '0b8f6a4e-3c1d-4e2a-8f7b-9d6c5e4a3b21';
let ff;
let result;

beforeAll(async () => {
  ff = await launchFirefox({
    extensions: [join(import.meta.dir, 'probes')],
    uuids: { 'probe@labinator.test': PROBE_UUID },
  });
  const ctx = await waitFor(
    async () => (await ff.contexts()).find(c => c.url.includes('/result.html#')),
    {
      timeout: 60000,
      label: 'probe result page',
    },
  );
  result = JSON.parse(decodeURIComponent(ctx.url.split('#')[1]));
  writeFileSync(join(ROOT, '.superpowers', 'probe-result.json'), JSON.stringify(result, null, 2));
});

afterAll(async () => {
  await ff?.close();
});

test('P1: the swap primitive keeps group membership and swaps the pair', () => {
  const byName = Object.fromEntries(result.p1.map(c => [c.name.slice(0, 2), c]));
  for (const c of result.p1) expect(c.before).toBe('u0 g1* g2* g3* u1 u2');
  expect(byName.S1.after).toBe('u0 g3* g2* g1* u1 u2');
  expect(byName.S2.after).toBe('u2 g1* g2* g3* u1 u0');
  expect(byName.S3.after).toBe('u0 g1* g2* g3* u2 u1');
});

test('P2: BiDi can script an extension page the extension opened itself', async () => {
  // BiDi refuses to navigate a tab to moz-extension:// ("not allowed in this context"), so tests reach
  // extension pages only through tabs the extension opens.
  const ctx = (await ff.contexts()).find(c => c.url.includes('/result.html#'));
  expect(await ff.evaluate(ctx.context, 'typeof browser.tabs.query')).toBe('function');
  // And from there, a page it opens is scriptable too.
  await ff.evaluate(
    ctx.context,
    `browser.tabs.create({ url: browser.runtime.getURL('page.html?p2') }).then(() => 1)`,
  );
  const p2 = await waitFor(
    async () => (await ff.contexts()).find(c => c.url.endsWith('page.html?p2')),
    { label: 'p2 page' },
  );
  expect(await ff.evaluate(p2.context, 'location.search')).toBe('?p2');
});

test('P3: a restored tab carries its tab value by its first complete load; a new tab does not', () => {
  const log = result.p3;
  const newAt = log.findIndex(e => e.event === 'phase' && e.name === 'new');
  const restored = log.slice(0, newAt).filter(e => e.event !== 'phase');
  const fresh = log.slice(newAt + 1);
  const firstComplete = events =>
    events.find(e => e.event === 'updated' && e.info?.status === 'complete');
  expect(firstComplete(restored)?.value).toBe(true);
  expect(firstComplete(fresh)?.value).toBeUndefined();
});

test('P4: recorded (fact, not a gate)', () => {
  expect(typeof result.p4.before).toBe('number');
});
