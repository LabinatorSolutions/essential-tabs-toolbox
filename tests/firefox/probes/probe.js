/* Platform probe: measures Firefox behaviors the add-on's design depends on, then reports them by
 * opening result.html#<json>. Throwaway test code; never shipped. */

const page = label => browser.runtime.getURL(`page.html?${label}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitComplete(tabId) {
  for (let i = 0; i < 100; i++) {
    const t = await browser.tabs.get(tabId);
    if (t.status === 'complete') return t;
    await sleep(50);
  }
  return browser.tabs.get(tabId);
}

/** Builds [u0, g1, g2, g3, u1, u2] in a fresh window with g1–g3 grouped. Returns label → tab id. */
async function layout() {
  const labels = ['u0', 'g1', 'g2', 'g3', 'u1', 'u2'];
  const win = await browser.windows.create({ url: labels.map(page) });
  const tabs = await browser.tabs.query({ windowId: win.id });
  tabs.sort((a, b) => a.index - b.index);
  const ids = Object.fromEntries(labels.map((l, i) => [l, tabs[i].id]));
  const groupId = await browser.tabs.group({ tabIds: [ids.g1, ids.g2, ids.g3] });
  return { win, ids, groupId };
}

async function snapshot(windowId, ids) {
  const byId = Object.fromEntries(Object.entries(ids).map(([l, id]) => [id, l]));
  const tabs = await browser.tabs.query({ windowId });
  tabs.sort((a, b) => a.index - b.index);
  return tabs.map(t => `${byId[t.id]}${t.groupId >= 0 ? '*' : ''}`).join(' ');
}

async function moveCase(name, steps) {
  const { win, ids } = await layout();
  const before = await snapshot(win.id, ids);
  for (const [label, index] of steps) await browser.tabs.move(ids[label], { index });
  const after = await snapshot(win.id, ids);
  await browser.windows.remove(win.id);
  return { name, before, after };
}

async function p1() {
  return [
    // Single leftward moves (documentation).
    await moveCase('E1 g3 -> index of g1', [['g3', 1]]),
    await moveCase('E2 g3 -> index of g2', [['g3', 2]]),
    await moveCase('E3 u2 -> index of g1', [['u2', 1]]),
    await moveCase('E4 u2 -> index of u1', [['u2', 4]]),
    // The swap primitive the sort uses: move A left onto B's slot, then B right onto A's old slot.
    await moveCase('S1 swap g1<->g3 inside group', [
      ['g3', 1],
      ['g1', 3],
    ]),
    await moveCase('S2 swap u0<->u2 across group', [
      ['u2', 0],
      ['u0', 5],
    ]),
    await moveCase('S3 swap u1<->u2 next to group end', [
      ['u2', 4],
      ['u1', 5],
    ]),
  ];
}

async function p3() {
  const log = [];
  const watched = new Set();
  const record = async (event, tab, extra = {}) => {
    let value;
    try {
      value = await browser.sessions.getTabValue(tab.id, 'seen');
    } catch (e) {
      value = `error: ${e.message}`;
    }
    log.push({
      event,
      url: tab.url,
      status: tab.status,
      discarded: tab.discarded,
      opener: tab.openerTabId,
      value,
      ...extra,
    });
  };
  const onCreated = tab => {
    if (watched.has('any')) {
      watched.add(tab.id);
      record('created', tab);
    }
  };
  const onUpdated = (id, info, tab) => {
    if (watched.has(id)) record('updated', tab, { info });
  };
  browser.tabs.onCreated.addListener(onCreated);
  browser.tabs.onUpdated.addListener(onUpdated);

  // Restored tab.
  const t = await browser.tabs.create({ url: page('p3-restored'), active: false });
  await waitComplete(t.id);
  await browser.sessions.setTabValue(t.id, 'seen', true);
  await browser.tabs.remove(t.id);
  await sleep(500);
  const closed = await browser.sessions.getRecentlyClosed();
  const entry = closed.find(s => s.tab?.url?.includes('p3-restored'));
  log.push({ event: 'phase', name: 'restore', found: Boolean(entry) });
  watched.add('any');
  if (entry) await browser.sessions.restore(entry.tab.sessionId);
  await sleep(1500);

  // Brand-new tab.
  log.push({ event: 'phase', name: 'new' });
  const n = await browser.tabs.create({ url: page('p3-new'), active: false });
  await waitComplete(n.id);
  await sleep(500);
  watched.delete('any');

  browser.tabs.onCreated.removeListener(onCreated);
  browser.tabs.onUpdated.removeListener(onUpdated);
  return log;
}

async function p4() {
  for (const l of ['p4a', 'p4b']) {
    const t = await browser.tabs.create({ url: page(l), active: false });
    await waitComplete(t.id);
    await browser.tabs.remove(t.id);
  }
  await sleep(500);
  const count = async () => (await browser.sessions.getRecentlyClosed()).length;
  const before = await count();
  await browser.browsingData.removeHistory({});
  await sleep(1000);
  const after = await count();
  return { before, after, max: browser.sessions.MAX_SESSION_RESULTS };
}

browser.runtime.onInstalled.addListener(async () => {
  const result = {};
  for (const [name, fn] of Object.entries({ p1, p3, p4 })) {
    try {
      result[name] = await fn();
    } catch (e) {
      result[name] = { error: String(e) };
    }
  }
  await browser.tabs.create({
    url: `${browser.runtime.getURL('result.html')}#${encodeURIComponent(JSON.stringify(result))}`,
  });
});
