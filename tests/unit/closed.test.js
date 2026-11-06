import { expect, test } from 'bun:test';
import { flattenClosed } from '../../src/lib/rules.js';

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
