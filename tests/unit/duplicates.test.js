import { expect, test } from 'bun:test';
import {
  closedMessage,
  duplicatesToClose,
  isProtected,
  keptNote,
  olderDuplicatesToClose,
} from '../../src/lib/rules.js';

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

const ids = r => r.close.map(x => x.id);

test('duplicatesToClose keeps the oldest copy when none is protected', () => {
  const r = duplicatesToClose([
    t(5, 'https://a.com/x'),
    t(2, 'https://a.com/x/'),
    t(7, 'https://a.com/x#top'),
    t(3, 'https://a.com/y'),
  ]);
  expect(ids(r)).toEqual([5, 7]);
  expect(r.kept).toBe(0);
});

test('duplicatesToClose keeps a protected copy and closes the loose ones', () => {
  const r = duplicatesToClose([
    t(1, 'https://www.youtube.com/watch?v=abc&t=10s'),
    t(2, 'https://youtu.be/abc'),
    t(3, 'https://www.youtube.com/watch?v=abc&list=PL1', { groupId: 4 }),
  ]);
  expect(ids(r)).toEqual([1, 2]);
  expect(r.kept).toBe(0);
});

test('duplicatesToClose never closes protected copies and counts the extra ones', () => {
  const r = duplicatesToClose([
    t(1, 'https://a.com/x', { groupId: 4 }),
    t(2, 'https://a.com/x', { pinned: true }),
    t(3, 'https://a.com/x', { active: true }),
    t(4, 'https://a.com/x'),
  ]);
  expect(ids(r)).toEqual([4]);
  expect(r.kept).toBe(2);
});

test('duplicatesToClose never compares private with normal, containers, or non-web tabs', () => {
  const r = duplicatesToClose([
    t(1, 'https://a.com/x'),
    t(2, 'https://a.com/x', { incognito: true }),
    t(3, 'https://a.com/x', { cookieStoreId: 'firefox-container-1' }),
    t(4, 'about:blank'),
    t(5, 'about:blank'),
  ]);
  expect(ids(r)).toEqual([]);
  expect(r.kept).toBe(0);
});

test('closedMessage and keptNote', () => {
  expect(closedMessage(1)).toBe('Closed 1 duplicate');
  expect(closedMessage(3)).toBe('Closed 3 duplicates');
  expect(keptNote(0)).toBe('');
  expect(keptNote(1)).toStartWith('1 more copy stays open');
  expect(keptNote(2)).toStartWith('2 more copies stay open');
});
