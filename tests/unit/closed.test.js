import { expect, test } from 'bun:test';
import { flattenClosed, reopenPlan } from '../../src/lib/rules.js';

test('flattenClosed keeps order and flattens closed windows into their tabs', () => {
  const sessions = [
    { tab: { sessionId: 't1', url: 'https://a.com/', title: 'A' } },
    {
      window: {
        sessionId: 'w1',
        tabs: [
          { sessionId: 'w1a', url: 'https://b.com/', title: 'B' },
          { url: 'https://c.com/', title: 'C' },
        ],
      },
    },
    { tab: { sessionId: 't2', url: 'https://d.com/', title: 'D' } },
  ];
  const out = flattenClosed(sessions);
  expect(out.map(e => e.sessionId ?? null)).toEqual(['t1', 'w1a', null, 't2']);
  expect(out.map(e => e.url)).toEqual([
    'https://a.com/',
    'https://b.com/',
    'https://c.com/',
    'https://d.com/',
  ]);
});

test('flattenClosed keeps container and private flags', () => {
  const [e] = flattenClosed([
    {
      tab: {
        sessionId: 's',
        url: 'https://a.com/',
        cookieStoreId: 'firefox-container-2',
        incognito: false,
      },
    },
  ]);
  expect(e.cookieStoreId).toBe('firefox-container-2');
  expect(e.incognito).toBe(false);
});

test('reopenPlan restores by session id, reopens web links in their container, refuses the rest', () => {
  expect(reopenPlan({ sessionId: 's1', url: 'about:config' })).toEqual({ restore: 's1' });
  expect(reopenPlan({ url: 'https://a.com/', cookieStoreId: 'firefox-container-2' })).toEqual({
    open: { url: 'https://a.com/', cookieStoreId: 'firefox-container-2' },
  });
  expect(reopenPlan({ url: 'https://a.com/' })).toEqual({ open: { url: 'https://a.com/' } });
  expect(reopenPlan({ url: 'javascript:alert(1)' })).toBeNull();
  expect(reopenPlan({ url: 'file:///etc/passwd' })).toBeNull();
  expect(
    reopenPlan({ url: 'https://a.com/', incognito: true, cookieStoreId: 'firefox-private' }),
  ).toBeNull();
});
