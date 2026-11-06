// Toolbar popup (spec §2.2–2.5, §4). Rules live in ../lib/rules.js; browser calls in ./actions.js.
import { copiedMessage, copyText, filterTabs, groupBySite } from '../lib/rules.js';
import { getSettings, setSetting } from '../lib/settings.js';
import { focusTab, sortWindow } from './actions.js';

const $ = sel => /** @type {HTMLElement} */ (document.querySelector(sel));
const list = /** @type {HTMLUListElement} */ ($('#list'));
const copyButton = /** @type {HTMLButtonElement} */ ($('#copy'));
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

function tabRow(tab) {
  const li = document.createElement('li');
  li.className = 'row';
  li.tabIndex = 0;
  li.dataset.tabId = String(tab.id);
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

async function render() {
  const tabs = await loadTabs();
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
  list.replaceChildren(frag);

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
  await setSetting('lastFilter', filter);
  await render();
}

async function activate(row) {
  const id = Number(row.dataset.tabId);
  if (await focusTab({ id })) {
    window.close();
  } else {
    row.remove();
  }
}

// Events
document.querySelector('.filters').addEventListener('click', e => {
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

$('#back').addEventListener('click', () => {
  state.site = null;
  render();
});

copyButton.addEventListener('click', () => copy(state.shown));

$('#sort').addEventListener('click', async () => {
  const win = await browser.windows.getCurrent();
  await sortWindow(win.id);
  await render();
  toast('Sorted');
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
for (const ev of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached', 'onDetached']) {
  browser.tabs[ev].addListener(rerender);
}

// Start
const settings = await getSettings();
state.filter = settings.lastFilter;
state.windowId = (await browser.windows.getCurrent()).id;
dupSwitch.setAttribute('aria-checked', String(settings.autoCloseDuplicates));
await render();
$('#links').focus();
