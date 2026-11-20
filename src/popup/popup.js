// Toolbar popup (spec §2.2–2.5, §4). Rules live in ../lib/rules.js; browser calls in ./actions.js.
import {
  closedMessage,
  copiedMessage,
  copyText,
  duplicatesToClose,
  filterTabs,
  groupBySite,
  keptNote,
  openStatus,
} from '../lib/rules.js';
import { getSettings, setSetting } from '../lib/settings.js';
import { focusTab, openLinks, recentlyClosed, restoreClosed, sortWindow } from './actions.js';

const $ = sel => /** @type {HTMLElement} */ (document.querySelector(sel));
const list = /** @type {HTMLUListElement} */ ($('#list'));
const copyButton = /** @type {HTMLButtonElement} */ ($('#copy'));
const filtersNav = $('.filters');
const dupsButton = $('#dups');
const dupClose = $('#dup-close');
const FILTERS = ['all', 'pinned', 'notPinned', 'bySite'];

/** What the popup shows. `site` is set while drilled into one site of the By site view. */
const state = {
  /** @type {'all' | 'pinned' | 'notPinned' | 'bySite'} */
  filter: 'all',
  /** @type {string | null} */
  site: null,
  /** @type {browser.tabs.Tab[]} tabs currently listed, for Copy */
  shown: [],
  windowId: browser.windows.WINDOW_ID_CURRENT,
  /** True while the Recently closed view is open. */
  closed: false,
  /** @type {Map<string, { sessionId?: string, url: string }>} closed entries by row key */
  closedEntries: new Map(),
  /** True while the Duplicates view is open. */
  dups: false,
  /** @type {'window' | 'all'} where the Duplicates view looks */
  scope: 'window',
};

let firstRender = true;

async function loadTabs() {
  const tabs = await browser.tabs.query({ windowId: state.windowId });
  return tabs.sort((a, b) => a.index - b.index);
}

/** Favicons only from web or data URLs; anything else (chrome://, about:) gets a blank square. */
function favicon(tab) {
  const src = tab.favIconUrl || '';
  if (/^(https?|data):/.test(src)) {
    const img = document.createElement('img');
    img.className = 'fav';
    img.alt = '';
    img.loading = 'lazy';
    img.src = src;
    return img;
  }
  const span = document.createElement('span');
  span.className = 'fav';
  return span;
}

function tabRow(tab, closedKey) {
  const li = document.createElement('li');
  li.className = 'row';
  li.tabIndex = 0;
  if (closedKey === undefined) li.dataset.tabId = String(tab.id);
  else li.dataset.sessionId = closedKey;
  li.setAttribute('role', 'button');
  const text = document.createElement('span');
  text.className = 'text';
  const title = document.createElement('b');
  title.textContent = tab.title || tab.url;
  const url = document.createElement('i');
  url.textContent = tab.url;
  text.append(title, url);
  li.append(favicon(tab), text);
  return li;
}

/** @param {string} key @param {string} label @param {number} count */
function siteRow(key, label, count) {
  const li = document.createElement('li');
  li.className = 'site';
  li.dataset.site = key;
  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'site-name';
  name.textContent = label;
  const n = document.createElement('span');
  n.className = 'count';
  n.textContent = String(count);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn-small copy';
  copy.textContent = 'Copy';
  li.append(name, n, copy);
  return li;
}

/**
 * The copies the Duplicates view would close, in the chosen scope.
 * @param {browser.tabs.Tab[]} [windowTabs] this window's tabs, when already loaded
 */
async function findDuplicates(windowTabs) {
  if (state.scope === 'window') return duplicatesToClose(windowTabs ?? (await loadTabs()));
  const tabs = await browser.tabs.query({});
  return duplicatesToClose(tabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index));
}

/** Shows the controls of one view and hides the others'. @param {'tabs' | 'closed' | 'dups'} view */
function showView(view) {
  filtersNav.hidden = view !== 'tabs';
  $('#scope').hidden = view !== 'dups';
  dupsButton.hidden = view === 'dups';
  if (view !== 'dups') {
    dupClose.hidden = true;
    $('#dup-note').hidden = true;
  }
}

/** Replaces the rows, keeping keyboard focus on the same tab. */
function fillList(frag) {
  const focusedId = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset?.tabId;
  list.replaceChildren(frag);
  if (focusedId)
    /** @type {HTMLElement | null} */ (list.querySelector(`[data-tab-id="${focusedId}"]`))?.focus();
}

/** @param {{ close: browser.tabs.Tab[], kept: number }} found */
function renderDuplicates({ close, kept }) {
  state.shown = close;
  const frag = document.createDocumentFragment();
  for (const tab of close) frag.append(tabRow(tab));
  fillList(frag);
  showView('dups');
  for (const b of document.querySelectorAll('[data-scope]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-scope') === state.scope));
  }
  $('#crumb').hidden = false;
  $('#crumb-label').textContent = 'Duplicates';
  copyButton.hidden = true;
  dupClose.hidden = close.length === 0;
  dupClose.textContent = `Close ${close.length}`;
  const empty = $('#empty');
  empty.hidden = close.length > 0;
  empty.textContent = 'No duplicates to close';
  const note = $('#dup-note');
  note.hidden = kept === 0;
  note.textContent = keptNote(kept);
}

async function renderClosed() {
  const entries = await recentlyClosed();
  state.closedEntries = new Map(entries.map((e, i) => [e.sessionId ?? `url:${i}`, e]));
  state.shown = /** @type {any} */ (entries);
  const frag = document.createDocumentFragment();
  for (const [key, e] of state.closedEntries) frag.append(tabRow(e, key));
  list.replaceChildren(frag);
  showView('closed');
  $('#crumb').hidden = false;
  $('#crumb-label').textContent = 'Recently closed';
  copyButton.hidden = entries.length === 0;
  const empty = $('#empty');
  empty.hidden = entries.length > 0;
  empty.textContent = 'No recently closed tabs';
}

async function render() {
  if (state.closed) return renderClosed();
  const tabs = await loadTabs();
  if (state.dups) return renderDuplicates(await findDuplicates(tabs));
  showView('tabs');
  const frag = document.createDocumentFragment();
  let showCopy = true;
  let crumb = null;

  if (state.filter === 'bySite') {
    const { sites, other } = groupBySite(tabs);
    if (state.site === null) {
      for (const s of sites) frag.append(siteRow(s.site, s.site, s.tabs.length));
      if (other.length) frag.append(siteRow('*other', 'Other sites', other.length));
      state.shown = [];
      showCopy = false;
    } else {
      const match = state.site === '*other' ? other : sites.find(s => s.site === state.site)?.tabs;
      if (!match) {
        state.site = null; // that site no longer has 2+ tabs
        return render();
      }
      state.shown = match;
      crumb = state.site === '*other' ? 'Other sites' : state.site;
    }
  } else {
    state.shown = filterTabs(tabs, state.filter);
  }

  for (const tab of state.shown) frag.append(tabRow(tab));
  fillList(frag);

  for (const b of document.querySelectorAll('[data-filter]')) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === state.filter));
  }
  $('#crumb').hidden = crumb === null;
  $('#crumb-label').textContent = crumb ?? '';
  copyButton.hidden = !showCopy;
  const empty = $('#empty');
  empty.hidden = list.childElementCount > 0;
  empty.textContent = 'No tabs here';

  if (firstRender) {
    firstRender = false;
    document.body.dataset.renderedMs = String(Math.round(performance.now()));
  }
  // After the list is up: counting must not delay it.
  const n = (await findDuplicates(tabs)).close.length;
  dupsButton.textContent = n ? `Duplicates ${n}` : 'Duplicates';
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2000);
}

/** @param {browser.tabs.Tab[]} tabs */
async function copy(tabs) {
  try {
    await navigator.clipboard.writeText(copyText(tabs));
    toast(copiedMessage(tabs.length));
  } catch {
    toast('Copy failed');
  }
}

async function setFilter(filter) {
  state.filter = filter;
  state.site = null;
  state.dups = false;
  await setSetting('lastFilter', filter);
  await render();
}

async function activate(row) {
  if (row.dataset.sessionId !== undefined) {
    const entry = state.closedEntries.get(row.dataset.sessionId);
    if (entry && (await restoreClosed(entry))) window.close();
    else row.remove();
    return;
  }
  const id = Number(row.dataset.tabId);
  if (await focusTab({ id })) {
    window.close();
  } else {
    row.remove();
  }
}

// Events
filtersNav.addEventListener('click', e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-filter]');
  if (b) setFilter(/** @type {any} */ (b.getAttribute('data-filter')));
});

list.addEventListener('click', async e => {
  const target = /** @type {HTMLElement} */ (e.target);
  const site = target.closest('.site');
  if (site) {
    const key = /** @type {HTMLElement} */ (site).dataset.site;
    if (target.closest('.copy')) {
      const { sites, other } = groupBySite(await loadTabs());
      await copy(key === '*other' ? other : (sites.find(s => s.site === key)?.tabs ?? []));
    } else if (target.closest('.site-name')) {
      state.site = key;
      await render();
    }
    return;
  }
  const row = target.closest('.row');
  if (row) activate(row);
});

list.addEventListener('keydown', e => {
  const row = /** @type {HTMLElement} */ (e.target).closest('.row');
  if (row && e.key === 'Enter') activate(row);
});

$('#closed').addEventListener('click', () => {
  state.closed = true;
  state.dups = false;
  render();
});

$('#back').addEventListener('click', () => {
  if (state.closed) state.closed = false;
  else if (state.dups) state.dups = false;
  else state.site = null;
  render();
});

dupsButton.addEventListener('click', () => {
  state.dups = true;
  state.closed = false;
  render();
});

$('#scope').addEventListener('click', async e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-scope]');
  if (!b) return;
  state.scope = /** @type {any} */ (b.getAttribute('data-scope'));
  await setSetting('dupScope', state.scope);
  await render();
});

dupClose.addEventListener('click', async () => {
  // Close only tabs that are listed and are still duplicates now.
  const listed = new Set(state.shown.map(t => t.id));
  const ids = (await findDuplicates()).close.map(t => t.id).filter(id => listed.has(id));
  try {
    await browser.tabs.remove(ids);
    toast(closedMessage(ids.length));
  } catch {
    toast('Close failed');
  }
  await render();
});

copyButton.addEventListener('click', () => copy(state.shown));

$('#sort').addEventListener('click', async () => {
  try {
    const win = await browser.windows.getCurrent();
    await sortWindow(win.id);
    toast('Sorted');
  } catch {
    toast('Sort failed');
  }
  await render();
});

const links = /** @type {HTMLTextAreaElement} */ ($('#links'));
let opening = false;
async function openPasted() {
  // A double click or a held Ctrl+Enter must not open the same links twice.
  if (opening) return;
  opening = true;
  let r;
  try {
    r = await openLinks(links.value);
  } finally {
    opening = false;
  }
  const status = $('#paste-status');
  status.textContent = openStatus({
    opened: r.opened,
    alreadyOpen: r.alreadyOpen,
    rejected: r.rejected.length,
  });
  status.hidden = false;
  // Only links that failed stay in the box, so they can be fixed.
  links.value = r.rejected.join('\n');
}
$('#open').addEventListener('click', openPasted);
links.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openPasted();
  }
});

const dupSwitch = $('#dup-switch');
dupSwitch.addEventListener('click', async () => {
  const on = dupSwitch.getAttribute('aria-checked') !== 'true';
  dupSwitch.setAttribute('aria-checked', String(on));
  await setSetting('autoCloseDuplicates', on);
});

document.addEventListener('keydown', e => {
  if (e.altKey && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    setFilter(/** @type {any} */ (FILTERS[Number(e.key) - 1]));
  }
});

// Keep the list live while the popup is open.
let pending;
const rerender = () => {
  clearTimeout(pending);
  pending = setTimeout(render, 50);
};
browser.sessions.onChanged.addListener(rerender);
for (const ev of ['onCreated', 'onRemoved', 'onMoved', 'onAttached', 'onDetached']) {
  browser.tabs[ev].addListener(rerender);
}

// Start
const settings = await getSettings();
state.filter = settings.lastFilter;
state.scope = settings.dupScope;
state.windowId = (await browser.windows.getCurrent()).id;
dupSwitch.setAttribute('aria-checked', String(settings.autoCloseDuplicates));
// Only changes this popup shows, in this window: a loading tab or a title counter elsewhere must not
// rebuild the list under the user's keyboard focus.
browser.tabs.onUpdated.addListener(rerender, {
  windowId: state.windowId,
  properties: ['url', 'title', 'favIconUrl', 'pinned'],
});
await render();
$('#links').focus();
