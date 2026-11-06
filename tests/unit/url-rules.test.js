import { expect, test } from 'bun:test';
import { cleanUrl, compareUrls, duplicateKey, parseLinks, siteKey } from '../../src/lib/rules.js';

test('cleanUrl removes known trackers only, keeps meaningful params and fragment', () => {
  expect(
    cleanUrl('https://shop.com/item/9?utm_source=x&utm_medium=y&color=red&gclid=1#reviews'),
  ).toBe('https://shop.com/item/9?color=red#reviews');
  expect(cleanUrl('https://shop.com/p?fbclid=abc')).toBe('https://shop.com/p');
  expect(cleanUrl('https://www.google.com/search?q=firefox&srsltid=z')).toBe(
    'https://www.google.com/search?q=firefox',
  );
  expect(cleanUrl('https://youtu.be/ID1?si=share123&t=30')).toBe('https://youtu.be/ID1?t=30');
  expect(cleanUrl('https://example.com/a?si=keep')).toBe('https://example.com/a?si=keep');
  expect(cleanUrl('about:config')).toBe('about:config');
});
test('duplicateKey ignores trackers and parameter order, keeps other params', () => {
  expect(duplicateKey('https://shop.com/p?id=1&utm_source=a')).toBe(
    duplicateKey('https://shop.com/p?gclid=z&id=1'),
  );
  expect(duplicateKey('https://a.com/x?b=2&a=1')).toBe(duplicateKey('https://a.com/x?a=1&b=2'));
  expect(duplicateKey('https://a.com/item?id=1')).not.toBe(duplicateKey('https://a.com/item?id=2'));
});
test('duplicateKey compares YouTube videos by video id only', () => {
  const k = duplicateKey('https://www.youtube.com/watch?v=ID1');
  for (const u of [
    'https://youtube.com/watch?v=ID1&t=90s',
    'https://m.youtube.com/watch?list=PL1&v=ID1&index=3',
    'https://youtu.be/ID1?si=x&t=4',
  ])
    expect(duplicateKey(u)).toBe(k);
  expect(duplicateKey('https://www.youtube.com/watch?v=ID2')).not.toBe(k);
  expect(duplicateKey('https://www.youtube.com/@labinator')).not.toBe(
    duplicateKey('https://www.youtube.com/@other'),
  );
});

test('duplicateKey drops fragment and one trailing slash, keeps query', () => {
  expect(duplicateKey('https://a.com/x/#top')).toBe(duplicateKey('https://a.com/x'));
  expect(duplicateKey('https://a.com/')).toBe(duplicateKey('https://a.com'));
  expect(duplicateKey('https://a.com/page?v=abc')).not.toBe(
    duplicateKey('https://a.com/page?v=xyz'),
  );
  expect(duplicateKey('HTTPS://A.COM/x')).toBe(duplicateKey('https://a.com/x'));
});
test('duplicateKey is null for non-web urls', () => {
  for (const u of [
    'about:newtab',
    'about:blank',
    'about:reader?url=https://a.com',
    'file:///x',
    'moz-extension://id/p.html',
    'view-source:https://a.com',
  ])
    expect(duplicateKey(u)).toBeNull();
});
test('siteKey strips one leading www. or m., keeps youtu.be separate', () => {
  expect(siteKey('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
  expect(siteKey('https://m.youtube.com/')).toBe('youtube.com');
  expect(siteKey('https://youtu.be/1')).toBe('youtu.be');
  expect(siteKey('https://www.m.example.com/')).toBe('m.example.com');
  expect(siteKey('about:home')).toBeNull();
});
test('compareUrls ignores scheme, www. and case; web before non-web', () => {
  const urls = [
    'about:config',
    'https://www.Github.com/b',
    'http://apple.com/',
    'https://github.com/a',
    'file:///a',
  ];
  expect([...urls].sort(compareUrls)).toEqual([
    'http://apple.com/',
    'https://github.com/a',
    'https://www.Github.com/b',
    'about:config',
    'file:///a',
  ]);
});
test('parseLinks: bare domains get https, junk is rejected, wrapping punctuation stripped, in-list duplicates dropped', () => {
  const r = parseLinks(
    'example.com\n(https://a.com/x),\t<https://b.com>\n\nHTTPS://C.com hello about:config https://a.com/x#y javascript:alert(1)',
  );
  expect(r.urls).toEqual([
    'https://example.com/',
    'https://a.com/x',
    'https://b.com/',
    'https://c.com/',
  ]);
  expect(r.rejected).toEqual(['hello', 'about:config', 'javascript:alert(1)']);
});
test('parseLinks keeps a closing bracket that belongs to the URL', () => {
  expect(parseLinks('(see https://en.wikipedia.org/wiki/Tab_(interface)).').urls).toEqual([
    'https://en.wikipedia.org/wiki/Tab_(interface)',
  ]);
});
