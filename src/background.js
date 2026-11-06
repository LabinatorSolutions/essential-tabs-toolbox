// Auto-close duplicate tabs (spec §2.4). Off by default.
//
// Every tab is checked exactly once, at its first finished page load, and then marked with a
// session tab value. Firefox restores that value with the tab (session restore, Reopen Closed Tab;
// probe P3), so a restored tab is never mistaken for a new one. Tabs are marked whether or not the
// setting is on, so turning it on later never treats existing tabs as new.

import { isWebUrl, olderDuplicatesToClose } from './lib/rules.js';
import { getSettings } from './lib/settings.js';

const MARK = 'ett-seen';
/** Ignore first loads for this long after install or browser start, while sessions restore. */
const GRACE_MS = 10000;
const BADGE_MS = 4000;

async function markAll() {
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs.map(t => browser.sessions.setTabValue(t.id, MARK, true)));
}

async function startGrace() {
  await browser.storage.session.set({ graceUntil: Date.now() + GRACE_MS });
  await markAll();
}

browser.runtime.onInstalled.addListener(startGrace);
browser.runtime.onStartup.addListener(startGrace);

// Turning the switch on: everything already open counts as seen.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.autoCloseDuplicates?.newValue === true) markAll();
});

browser.tabs.onUpdated.addListener(
  async (tabId, changeInfo, tab) => {
    // "complete" carries the final URL, so a redirect to an open page is caught too.
    if (changeInfo.status !== 'complete' || !isWebUrl(tab.url)) return;
    if (await browser.sessions.getTabValue(tabId, MARK)) return;
    await browser.sessions.setTabValue(tabId, MARK, true);

    const { autoCloseDuplicates } = await getSettings();
    if (!autoCloseDuplicates) return;
    const { graceUntil = 0 } = await browser.storage.session.get('graceUntil');
    if (Date.now() < graceUntil) return;

    const ids = olderDuplicatesToClose(tab, await browser.tabs.query({}));
    if (!ids.length) return;
    await browser.tabs.remove(ids);
    showClosed(ids.length);
  },
  { properties: ['status'] },
);

let badgeCount = 0;
let badgeTimer;

/** Shows how many tabs were just closed on the toolbar badge, then clears it. */
function showClosed(n) {
  badgeCount += n;
  browser.action.setBadgeBackgroundColor({ color: '#2400ff' });
  browser.action.setBadgeTextColor({ color: '#ffffff' });
  browser.action.setBadgeText({ text: String(badgeCount) });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badgeCount = 0;
    browser.action.setBadgeText({ text: '' });
  }, BADGE_MS);
}
