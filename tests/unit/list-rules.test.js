import { expect, test } from 'bun:test';
import {
  copiedMessage,
  copyText,
  filterTabs,
  groupBySite,
  openStatus,
} from '../../src/lib/rules.js';

let nextIndex = 0;
const t = (id, url, extra = {}) => ({
  id,
  index: nextIndex++,
  url,
  title: url,
  pinned: false,
  groupId: -1,
  ...extra,
});

test('filterTabs splits on pinned and keeps order', () => {
  const tabs = [
    t(1, 'https://a.com', { pinned: true }),
    t(2, 'https://b.com'),
    t(3, 'https://c.com', { pinned: true }),
  ];
  expect(filterTabs(tabs, 'all').map(x => x.id)).toEqual([1, 2, 3]);
  expect(filterTabs(tabs, 'pinned').map(x => x.id)).toEqual([1, 3]);
  expect(filterTabs(tabs, 'notPinned').map(x => x.id)).toEqual([2]);
});

test('groupBySite: sites with 2+ tabs, biggest first; singles and non-web go to other', () => {
  const tabs = [
    t(1, 'https://www.youtube.com/watch?v=1', { pinned: true }),
    t(2, 'https://developer.mozilla.org/x'),
    t(3, 'https://github.com/a'),
    t(4, 'https://m.youtube.com/watch?v=2'),
    t(5, 'about:config'),
    t(6, 'https://youtube.com/watch?v=3'),
    t(7, 'https://github.com/b'),
  ];
  const { sites, other } = groupBySite(tabs);
  expect(sites.map(s => s.site)).toEqual(['youtube.com', 'github.com']);
  expect(sites[0].tabs.map(x => x.id)).toEqual([1, 4, 6]);
  expect(other.map(x => x.id)).toEqual([2, 5]);
});

test('groupBySite orders a count tie by name', () => {
  const tabs = [
    t(1, 'https://zeta.com/1'),
    t(2, 'https://zeta.com/2'),
    t(3, 'https://alpha.com/1'),
    t(4, 'https://alpha.com/2'),
  ];
  expect(groupBySite(tabs).sites.map(s => s.site)).toEqual(['alpha.com', 'zeta.com']);
});

test('copyText is clean URLs, one per line, no trailing newline', () => {
  expect(copyText([t(1, 'https://shop.com/p?utm_source=x&id=2'), t(2, 'about:config')])).toBe(
    'https://shop.com/p?id=2\nabout:config',
  );
});

test('copiedMessage pluralizes', () => {
  expect(copiedMessage(1)).toBe('Copied 1 URL');
  expect(copiedMessage(50)).toBe('Copied 50 URLs');
});

test('openStatus formats the paste outcome', () => {
  expect(openStatus({ opened: 12, alreadyOpen: 3, rejected: 1 })).toBe(
    'Opened 12 · 3 already open · 1 not a link',
  );
  expect(openStatus({ opened: 0, alreadyOpen: 0, rejected: 2 })).toBe('2 not links');
  expect(openStatus({ opened: 0, alreadyOpen: 0, rejected: 0 })).toBe('Nothing to open');
  expect(openStatus({ opened: 1, alreadyOpen: 0, rejected: 0 })).toBe('Opened 1');
});
