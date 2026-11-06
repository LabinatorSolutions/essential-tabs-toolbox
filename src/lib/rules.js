// Rules: every pure decision the add-on makes. No `browser` or DOM access here, so all of it is
// unit-tested with `bun test`.

/** Known tracking parameters (spec §3.3). Every `utm_*` parameter is matched by prefix. */
export const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  '_ga',
  '_gl',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'srsltid',
]);

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/** @param {string} url */
function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * True for http: and https: URLs only.
 * @param {string} url
 */
export function isWebUrl(url) {
  const u = parse(url);
  return Boolean(u && (u.protocol === 'http:' || u.protocol === 'https:'));
}

/** @param {string} name @param {string} host */
function isTracking(name, host) {
  if (name.startsWith('utm_') || TRACKING_PARAMS.has(name)) return true;
  return name === 'si' && (YOUTUBE_HOSTS.has(host) || host === 'youtu.be');
}

/**
 * The query's raw `key=value` parts that are not trackers. Raw parts are kept as written, so
 * cleaning never re-encodes what remains.
 * @param {URL} u
 */
function keptParams(u) {
  if (!u.search) return [];
  return u.search
    .slice(1)
    .split('&')
    .filter(part => {
      if (!part) return false;
      const raw = part.split('=')[0];
      let name = raw;
      try {
        name = decodeURIComponent(raw.replace(/\+/g, ' '));
      } catch {
        // keep the raw name
      }
      return !isTracking(name, u.hostname);
    });
}

/**
 * The URL with known tracking parameters removed and everything else kept, fragment included.
 * Non-web URLs are returned unchanged.
 * @param {string} url
 */
export function cleanUrl(url) {
  if (!isWebUrl(url)) return url;
  const u = /** @type {URL} */ (parse(url));
  const kept = keptParams(u);
  u.search = kept.length ? `?${kept.join('&')}` : '';
  return u.href;
}

/**
 * The key two tabs must share to count as the same page (spec §2.4 rule 4), or null for tabs that
 * never take part in duplicate checks.
 * @param {string} url
 * @returns {string | null}
 */
export function duplicateKey(url) {
  if (!isWebUrl(url)) return null;
  const u = /** @type {URL} */ (parse(url));

  // YouTube videos compare by video id only: timestamps, playlists and share ids don't matter.
  if (YOUTUBE_HOSTS.has(u.hostname) && u.pathname === '/watch') {
    const v = u.searchParams.get('v');
    if (v) return `youtube:video:${v}`;
  }
  if (u.hostname === 'youtu.be') {
    const id = u.pathname.split('/')[1];
    if (id) return `youtube:video:${id}`;
  }

  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const params = keptParams(u).sort();
  return `${u.protocol}//${u.host}${path}${params.length ? `?${params.join('&')}` : ''}`;
}

/**
 * The site a tab belongs to in the By site view: the hostname with one leading `www.` or `m.`
 * removed. Null for non-web URLs.
 * @param {string} url
 * @returns {string | null}
 */
export function siteKey(url) {
  if (!isWebUrl(url)) return null;
  const host = /** @type {URL} */ (parse(url)).hostname;
  if (host.startsWith('www.')) return host.slice(4);
  if (host.startsWith('m.')) return host.slice(2);
  return host;
}

/** @param {string} url @returns {[number, string]} */
function sortKey(url) {
  if (!isWebUrl(url)) return [1, url.toLowerCase()];
  const rest = /** @type {URL} */ (parse(url)).href.replace(/^https?:\/\//, '').toLowerCase();
  return [0, rest.startsWith('www.') ? rest.slice(4) : rest];
}

/**
 * Sort order for "Sort A→Z": by URL, ignoring the scheme, one leading `www.` and case. Web URLs
 * come before every non-web URL.
 * @param {string} a
 * @param {string} b
 */
export function compareUrls(a, b) {
  const [ra, ka] = sortKey(a);
  const [rb, kb] = sortKey(b);
  if (ra !== rb) return ra - rb;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Strips punctuation that prose wraps around links, keeping a closing bracket the URL opened. */
function unwrap(token) {
  let s = token.replace(/^[(<["']+/, '');
  const pairs = { ')': '(', ']': '[' };
  for (;;) {
    const last = s.at(-1);
    if (!last || !`)]>"'.,;:`.includes(last)) break;
    const open = pairs[last];
    if (open && s.split(open).length - 1 >= s.split(last).length - 1) break; // balanced: part of the URL
    s = s.slice(0, -1);
  }
  return s;
}

/**
 * Parses pasted text into links to open (spec §2.1).
 * @param {string} text
 * @returns {{ urls: string[], rejected: string[] }}
 */
export function parseLinks(text) {
  const urls = [];
  const rejected = [];
  const seen = new Set();
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const s = unwrap(token);
    const candidate = HAS_SCHEME.test(s) ? s : BARE_HOST.test(s) ? `https://${s}` : null;
    if (!candidate || !isWebUrl(candidate)) {
      rejected.push(token);
      continue;
    }
    const href = /** @type {URL} */ (parse(candidate)).href;
    const key = duplicateKey(href);
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(href);
  }
  return { urls, rejected };
}
