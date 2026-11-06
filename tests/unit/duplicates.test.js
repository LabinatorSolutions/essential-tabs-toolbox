import { expect, test } from 'bun:test';
import { isProtected, olderDuplicatesToClose } from '../../src/lib/rules.js';

const t = (id, url, extra = {}) => ({
  id,
  index: id,
  url,
  pinned: false,
  groupId: -1,
  incognito: false,
  cookieStoreId: 'firefox-default',
  ...extra,
});

test('isProtected: pinned, audible, sharing, grouped', () => {
  expect(isProtected(t(1, 'https://a.com', { pinned: true }))).toBe(true);
  expect(isProtected(t(1, 'https://a.com', { audible: true }))).toBe(true);
  expect(isProtected(t(1, 'https://a.com', { sharingState: { camera: true } }))).toBe(true);
  expect(isProtected(t(1, 'https://a.com', { sharingState: { microphone: true } }))).toBe(true);
  expect(isProtected(t(1, 'https://a.com', { sharingState: { screen: 'Screen' } }))).toBe(true);
  expect(isProtected(t(1, 'https://a.com', { groupId: 3 }))).toBe(true);
  expect(isProtected(t(1, 'https://a.com'))).toBe(false);
  expect(isProtected(t(1, 'https://a.com', { groupId: undefined }))).toBe(false);
});

test('olderDuplicatesToClose closes every unprotected older copy, never the new tab', () => {
  const n = t(9, 'https://a.com/x#top');
  const tabs = [t(1, 'https://a.com/x'), t(2, 'https://a.com/x/'), t(3, 'https://a.com/y'), n];
  expect(olderDuplicatesToClose(n, tabs)).toEqual([1, 2]);
});

test('olderDuplicatesToClose skips protected copies', () => {
  const n = t(9, 'https://a.com/x');
  expect(
    olderDuplicatesToClose(n, [
      t(1, 'https://a.com/x', { pinned: true }),
      t(2, 'https://a.com/x'),
      n,
    ]),
  ).toEqual([2]);
  expect(olderDuplicatesToClose(n, [t(1, 'https://a.com/x', { groupId: 4 }), n])).toEqual([]);
});

test('olderDuplicatesToClose never crosses containers or private browsing', () => {
  const n = t(9, 'https://a.com/x');
  expect(
    olderDuplicatesToClose(n, [
      t(1, 'https://a.com/x', { cookieStoreId: 'firefox-container-1' }),
      n,
    ]),
  ).toEqual([]);
  expect(
    olderDuplicatesToClose(n, [
      t(1, 'https://a.com/x', { incognito: true, cookieStoreId: 'firefox-private' }),
      n,
    ]),
  ).toEqual([]);
});

test('olderDuplicatesToClose ignores non-web tabs and newer tabs (race between two new tabs)', () => {
  expect(olderDuplicatesToClose(t(9, 'about:newtab'), [t(1, 'about:newtab')])).toEqual([]);
  const seven = t(7, 'https://a.com/x');
  const eight = t(8, 'https://a.com/x');
  expect(olderDuplicatesToClose(seven, [seven, eight])).toEqual([]);
  expect(olderDuplicatesToClose(eight, [seven, eight])).toEqual([7]);
});

test('olderDuplicatesToClose matches tracker-only and YouTube timestamp differences', () => {
  const n = t(9, 'https://www.youtube.com/watch?v=ID1&t=90');
  expect(
    olderDuplicatesToClose(n, [t(1, 'https://youtu.be/ID1'), t(2, 'https://shop.com/p?id=1'), n]),
  ).toEqual([1]);
  const s = t(9, 'https://shop.com/p?id=1&utm_source=mail');
  expect(olderDuplicatesToClose(s, [t(2, 'https://shop.com/p?gclid=x&id=1'), s])).toEqual([2]);
});

test('C1: the tab the user is looking at (active in its window) is never closed', () => {
  expect(isProtected(t(1, 'https://a.com', { active: true }))).toBe(true);
  const n = t(9, 'https://a.com/article#comments');
  expect(olderDuplicatesToClose(n, [t(1, 'https://a.com/article', { active: true }), n])).toEqual(
    [],
  );
});
