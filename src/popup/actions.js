// Popup actions that call the browser. Decisions live in ../lib/rules.js.
import { swapMoves } from '../lib/rules.js';

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
