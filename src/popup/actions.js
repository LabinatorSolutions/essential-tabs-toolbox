// Popup actions that call the browser. Decisions live in ../lib/rules.js.
import { duplicateKey, parseLinks, swapMoves } from '../lib/rules.js';

/**
 * Sorts a window's non-pinned tabs by URL, inside each tab group (spec §2.5).
 * @param {number} windowId
 */
export async function sortWindow(windowId) {
  const tabs = await browser.tabs.query({ windowId });
  for (const { id, index, ungroup } of swapMoves(tabs)) {
    await browser.tabs.move(id, { index });
    // Firefox put this ungrouped tab into the group it now sits after; it is at the group's edge,
    // so ungrouping leaves it in place.
    if (ungroup) await browser.tabs.ungroup(id);
  }
}

/**
 * Switches to a tab and focuses its window. Resolves false if the tab no longer exists.
 * @param {{ id: number, windowId?: number }} tab
 */
export async function focusTab(tab) {
  try {
    const t = await browser.tabs.update(tab.id, { active: true });
    await browser.windows.update(t.windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens pasted links (spec §2.1): in the current window, in the background, unloaded until
 * clicked, in the active tab's container. Links already open (same private/normal kind and same
 * container, any window) are skipped.
 * @param {string} text
 * @returns {Promise<{ opened: number, alreadyOpen: number, rejected: string[] }>}
 */
export async function openLinks(text) {
  const { urls, rejected } = parseLinks(text);
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  const cookieStoreId = active?.cookieStoreId;
  const incognito = Boolean(active?.incognito);
  const open = new Set(
    (await browser.tabs.query({}))
      .filter(t => Boolean(t.incognito) === incognito && t.cookieStoreId === cookieStoreId)
      .map(t => duplicateKey(t.url)),
  );
  let opened = 0;
  let alreadyOpen = 0;
  const failed = [];
  for (const url of urls) {
    const key = duplicateKey(url);
    if (open.has(key)) {
      alreadyOpen++;
      continue;
    }
    try {
      await browser.tabs.create({
        url,
        active: false,
        discarded: true,
        title: url,
        cookieStoreId,
        windowId: active?.windowId,
      });
      open.add(key);
      opened++;
    } catch {
      failed.push(url);
    }
  }
  return { opened, alreadyOpen, rejected: [...rejected, ...failed] };
}
