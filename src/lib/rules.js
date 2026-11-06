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

// A bare host must end in a real-looking top-level label (letters, or punycode), so prose such as
// "e.g." or "1.5" never becomes a link. IP addresses need an explicit scheme.
const BARE_HOST = /^([a-z0-9-]+\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})(:\d+)?([/?#]\S*)?$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Strips punctuation that prose wraps around links, keeping a closing bracket the URL opened. */
function unwrap(token) {
  let s = token.replace(/^[(<["'“‘«]+/, '');
  const pairs = { ')': '(', ']': '[' };
  for (;;) {
    const last = s.at(-1);
    if (!last || !`)]>"'.,;:!…”’»`.includes(last)) break;
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
    let s = unwrap(token);
    // A link inside other text: Markdown "[label](https://…)" or "label:https://…".
    const inner = s.search(/https?:\/\//i);
    if (inner > 0) s = unwrap(s.slice(inner));
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

/**
 * Firefox's tab object. Only its type is used here (for checking); rules.js never calls `browser`.
 * @typedef {browser.tabs.Tab} Tab
 */

/**
 * @param {Tab[]} tabs
 * @param {'all' | 'pinned' | 'notPinned'} filter
 * @returns {Tab[]}
 */
export function filterTabs(tabs, filter) {
  if (filter === 'pinned') return tabs.filter(t => t.pinned);
  if (filter === 'notPinned') return tabs.filter(t => !t.pinned);
  return tabs;
}

/**
 * By site view (spec §2.3): one entry per site with 2 or more tabs, biggest first, then by name.
 * Single-tab sites and non-web tabs go to `other`, in tab order.
 * @param {Tab[]} tabs
 * @returns {{ sites: { site: string, tabs: Tab[] }[], other: Tab[] }}
 */
export function groupBySite(tabs) {
  /** @type {Map<string, Tab[]>} */
  const bySite = new Map();
  for (const tab of tabs) {
    const site = siteKey(tab.url);
    if (!site) continue;
    if (!bySite.has(site)) bySite.set(site, []);
    bySite.get(site).push(tab);
  }
  const sites = [...bySite]
    .filter(([, list]) => list.length >= 2)
    .map(([site, list]) => ({ site, tabs: list }))
    .sort(
      (a, b) => b.tabs.length - a.tabs.length || (a.site < b.site ? -1 : a.site > b.site ? 1 : 0),
    );
  const grouped = new Set(sites.flatMap(s => s.tabs));
  return { sites, other: tabs.filter(t => !grouped.has(t)) };
}

/**
 * Clipboard text for a set of tabs: clean URLs (spec §3.3), one per line.
 * @param {{ url?: string }[]} tabs
 */
export function copyText(tabs) {
  return tabs.map(t => cleanUrl(t.url)).join('\n');
}

/** @param {number} n */
export function copiedMessage(n) {
  return `Copied ${n} ${n === 1 ? 'URL' : 'URLs'}`;
}

/**
 * The status line under the paste box (spec §2.1).
 * @param {{ opened: number, alreadyOpen: number, rejected: number }} r
 */
export function openStatus({ opened, alreadyOpen, rejected }) {
  const parts = [];
  if (opened) parts.push(`Opened ${opened}`);
  if (alreadyOpen) parts.push(`${alreadyOpen} already open`);
  if (rejected) parts.push(`${rejected} ${rejected === 1 ? 'not a link' : 'not links'}`);
  return parts.length ? parts.join(' · ') : 'Nothing to open';
}

/**
 * "Sort A→Z" target order (spec §2.5): non-pinned tabs only. Each tab group is sorted within the
 * slots it already holds; ungrouped tabs are sorted and refilled into the ungrouped slots in order.
 * Returns every non-pinned tab with its target index, ascending by index.
 * @param {Tab[]} tabs
 * @returns {{ id: number, index: number }[]}
 */
export function planSort(tabs) {
  /** @type {Map<number, Tab[]>} */
  const partitions = new Map();
  for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
    if (tab.pinned) continue;
    const group = tab.groupId >= 0 ? tab.groupId : -1;
    if (!partitions.has(group)) partitions.set(group, []);
    partitions.get(group).push(tab);
  }
  const target = [];
  for (const members of partitions.values()) {
    const slots = members.map(t => t.index);
    const sorted = [...members].sort((a, b) => compareUrls(a.url, b.url));
    sorted.forEach((tab, i) => {
      target.push({ id: tab.id, index: slots[i] });
    });
  }
  return target.sort((a, b) => a.index - b.index);
}

/**
 * The `tabs.move` calls that reach `planSort`'s order with every tab still in its own group.
 *
 * Firefox gives a moved tab the group of its anchor: the tab it now sits before when it moved left,
 * or the tab it now sits after when it moved right (probe P1, case E3, and the sort e2e test). So:
 * - tabs are swapped, never shifted: move A left onto B's slot, then B right onto A's old slot.
 *   Every other tab ends where it started, and each move lands in a slot of the tab's own partition;
 * - a move that leaves an ungrouped tab right after a group's last tab is flagged `ungroup`, and
 *   the caller removes it from that group again.
 * @param {Tab[]} tabs
 * @returns {{ id: number, index: number, ungroup?: true }[]}
 */
export function swapMoves(tabs) {
  const order = [...tabs].sort((a, b) => a.index - b.index).map(t => t.id);
  const groupOf = new Map(tabs.map(t => [t.id, t.groupId >= 0 ? t.groupId : -1]));
  const moves = [];
  const move = (id, index) => {
    const from = order.indexOf(id);
    order.splice(from, 1);
    order.splice(index, 0, id);
    const anchor = index < from ? order[index + 1] : order[index - 1];
    const joinsGroup = groupOf.get(id) === -1 && anchor !== undefined && groupOf.get(anchor) >= 0;
    moves.push(joinsGroup ? { id, index, ungroup: /** @type {const} */ (true) } : { id, index });
  };
  for (const { id: want, index: slot } of planSort(tabs)) {
    const current = order[slot];
    if (current === want) continue;
    const from = order.indexOf(want); // always > slot: every earlier slot is already final
    move(want, slot);
    move(current, from);
  }
  return moves;
}

/**
 * An older copy that auto-close must leave open (spec §2.4 rules 2–3): the active tab of its window
 * (the one the user sees there), pinned, playing audio, using the camera, microphone or screen
 * sharing, or inside a tab group.
 */
export function isProtected(tab) {
  const s = tab.sharingState;
  return Boolean(
    tab.active ||
      tab.pinned ||
      tab.audible ||
      s?.camera ||
      s?.microphone ||
      s?.screen ||
      tab.groupId >= 0,
  );
}

/**
 * The older copies to close when `newTab` has finished its first page load (spec §2.4). The new
 * tab is kept. "Older" means a lower tab id, so two copies opened at the same moment never close
 * each other. Private and normal tabs, and different containers, are never compared.
 * @param {Tab} newTab
 * @param {Tab[]} tabs
 * @returns {number[]}
 */
export function olderDuplicatesToClose(newTab, tabs) {
  const key = duplicateKey(newTab.url);
  if (!key) return [];
  const store = t => t.cookieStoreId ?? 'firefox-default';
  return tabs
    .filter(
      t =>
        t.id < newTab.id &&
        Boolean(t.incognito) === Boolean(newTab.incognito) &&
        store(t) === store(newTab) &&
        duplicateKey(t.url) === key &&
        !isProtected(t),
    )
    .map(t => t.id);
}

/**
 * @typedef {{ sessionId?: string, url: string, title: string, favIconUrl?: string, cookieStoreId?: string,
 *   incognito?: boolean }} ClosedEntry
 */

/**
 * Recently closed entries (spec §2.6), newest first, with closed windows flattened into their tabs.
 * A tab from a closed window may have no `sessionId` of its own; see `reopenPlan`.
 * @param {browser.sessions.Session[]} sessions
 * @returns {ClosedEntry[]}
 */
export function flattenClosed(sessions) {
  /** @type {ClosedEntry[]} */
  const out = [];
  const add = t =>
    out.push({
      sessionId: t.sessionId,
      url: t.url,
      title: t.title || t.url,
      favIconUrl: t.favIconUrl,
      cookieStoreId: t.cookieStoreId,
      incognito: t.incognito,
    });
  for (const s of sessions) {
    if (s.tab) add(s.tab);
    else if (s.window) for (const t of s.window.tabs ?? []) add(t);
  }
  return out;
}

/**
 * How to bring a closed entry back. Firefox restores entries that have a session id, with their
 * history and container. Otherwise the link is reopened only if it is a web link, in its own
 * container, and never for a private tab (that would reopen it outside private browsing).
 * @param {{ sessionId?: string, url: string, cookieStoreId?: string, incognito?: boolean }} entry
 * @returns {{ restore: string } | { open: { url: string, cookieStoreId?: string } } | null}
 */
export function reopenPlan(entry) {
  if (entry.sessionId) return { restore: entry.sessionId };
  if (entry.incognito || !isWebUrl(entry.url)) return null;
  return {
    open: entry.cookieStoreId
      ? { url: entry.url, cookieStoreId: entry.cookieStoreId }
      : { url: entry.url },
  };
}
