// Settings in browser.storage.local (spec §3.2).

export const DEFAULTS = Object.freeze({
  /** Off by default: the owner's call at approval. */
  autoCloseDuplicates: false,
  /** @type {'all' | 'pinned' | 'notPinned' | 'bySite'} */
  lastFilter: 'all',
});

/** @returns {Promise<{ autoCloseDuplicates: boolean, lastFilter: 'all' | 'pinned' | 'notPinned' | 'bySite' }>} */
export async function getSettings() {
  return { ...DEFAULTS, ...(await browser.storage.local.get({ ...DEFAULTS })) };
}

/**
 * @param {keyof typeof DEFAULTS} key
 * @param {unknown} value
 */
export async function setSetting(key, value) {
  await browser.storage.local.set({ [key]: value });
}
