# Essential Tabs Toolbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Essential Tabs Toolbox Firefox add-on (v1.0.0). It opens pasted links, lists and copies tabs
(including copy-by-site), sorts by URL inside tab groups, and closes duplicates automatically (off by default), and lists recently closed tabs for one-click restore.

**Architecture:** Plain JavaScript ES modules with no build step:

- One DOM-free rules module (`src/lib/rules.js`) holds every decision and is unit-tested with `bun test`.
- A non-persistent event page (`src/background.js`) runs auto-close.
- A toolbar popup (`src/popup/`) does everything else.
- Real-Firefox behavior is tested by driving the installed Firefox 159 over native WebDriver BiDi from Bun
  (`tests/firefox/`).

**Tech Stack:** Firefox MV3, Bun 1.4, Biome 2.6, rumdl, web-ext 10.8, TypeScript 7 (`tsc --checkJs` only),
`@types/firefox-webext-browser`.

**Spec:** `docs/superpowers/specs/2026-11-06-essential-tabs-toolbox-design.md` (approved 2026-11-06). Read it before
any task. Section numbers below (§2.4 etc.) refer to it.

## Global Constraints

- Manifest:
  - `manifest_version: 3`, `version: "1.0.0"`, `name: "Essential Tabs Toolbox"`.
  - `browser_specific_settings.gecko.id: "essential-tabs-toolbox@labinator.com"`, `strict_min_version: "159.0"`.
  - `data_collection_permissions: { "required": ["none"], "optional": [] }`.
  - `author: "Labinator"`, `developer: { "name": "Labinator", "url": "https://labinator.com/" }`,
    `homepage_url: "https://github.com/LabinatorSolutions/essential-tabs-toolbox"`.
- Permissions:
  - `tabs`, `storage`, `cookies`. The `cookies` permission is needed only for `tabs.create({ cookieStoreId })`; it
    shows no install warning.
  - `sessions`: always, for Recently closed (spec §2.6). It also provides the restored-tab marker if probe P3
    passes. Install prompt line: "Access recently closed tabs".
  - No `host_permissions`, no content scripts.
- Desktop only. Do not add `gecko_android`. When uploading to AMO, tick Firefox only.
- Settings in `browser.storage.local`: `autoCloseDuplicates` default **`false`**; `lastFilter` default `"all"`.
- Exact UI copy:
  - Filter labels: `All`, `Pinned`, `Not pinned`, `By site`. No counts on filter buttons.
  - Buttons: `Open`, `Recently closed`, `Sort A→Z`, `Copy`. The switch label is `Close duplicates`.
  - Empty recently-closed list: `No recently closed tabs`.
  - Placeholder: `Paste links to open…`.
  - The catch-all site row: `Other sites`.
  - Messages: `Copied 1 URL` / `Copied N URLs`; `Sorted`. The paste status format is in Task 3.
- Colors are the Labinator `DESIGN.md` tokens: paper `#f7f5ef`, paper-bright `#ffffff`, ink `#141414`, slate
  `#404040`, ultramarine `#2400ff`, hairline `#e3dfd6`, hairline-strong `#847e71`, wash `#e5e2fc`.
- Shape and type:
  - Rows and panels have square corners; buttons and inputs have a 2 px radius. No shadows or gradients.
  - Single light theme. System font stack.
  - A 2 px `#2400ff` focus ring with a 2 px offset on every control.
- American English in code, comments and docs.
- Code layout:
  - Every module is an ES module.
  - `browser.*` calls live only in `src/background.js`, `src/popup/*.js` and `src/lib/settings.js`.
  - `src/lib/rules.js` must not reference `browser` or `document`.
- Git: low-risk repo. Commit after each task and push. No AI attribution lines in commits.

## Review Focus

1. **Pasted text copied from prose**: links wrapped in punctuation (`(https://a.com/x),`, `<https://a.com>`), with
   an uppercase scheme (`HTTPS://A.com`), or separated by tabs or blank lines. The user expects each wrapped link
   to open clean, and real junk to be listed as rejected. Pinned in Task 2 (`parseLinks` tests).
2. **Non-web tabs everywhere**: `about:`, `about:reader?url=…`, `moz-extension:`, `file:`, `view-source:`. The
   user expects them listed and copyable, but never treated as a site, a duplicate, or sorted among web tabs.
   Pinned in Tasks 2 and 3.
3. **A new tab that redirects to a page already open** (`/go` → 302 → `/a`). The user expects the redirect target
   to count as the duplicate. Pinned in Task 5's e2e (`D7`).
4. **Stale popup**: a tab closes after the popup rendered and its row is then clicked. The user expects the row to
   disappear, with no error and no frozen popup. Pinned in Task 6's e2e (`P6`).
5. **A big window**: 300 tabs. The user expects the popup to be usable at once (spec §4: about 150 ms). Pinned in
   Task 6's e2e (`P7`).

## File Structure

```text
manifest.json                    MV3 manifest (Task 1, extended in 5/6/8)
icon.svg                         Labinator icon (Task 9)
src/lib/rules.js                 every pure decision (Tasks 2–5)
src/lib/settings.js              storage defaults + get/set (Task 5)
src/background.js                auto-close duplicates + badge (Task 5)
src/popup/popup.html|.css|.js    popup UI (Tasks 6–7)
src/popup/actions.js             browser-calling popup actions: openLinks, sortWindow, focusTab, recentlyClosed, restoreClosed (Tasks 4, 6–8)
tests/unit/*.test.js             bun unit tests for rules.js
tests/firefox/harness.js         launch Firefox 159 + BiDi client + local HTTP fixture server (Task 1)
tests/firefox/probes/            throwaway probe extension for platform facts (Task 1)
tests/firefox/*.test.js          real-Firefox e2e tests
docs/superpowers/notes/2026-11-06-firefox-probes.md   probe results + decisions (Task 1)
package.json biome.json tsconfig.json web-ext-config.mjs .rumdl.toml .gitignore
README.md CONTRIBUTING.md SECURITY.md TESTING-CHECKLIST.md CHANGELOG.md   (Task 9)
```

---

### Task 1: Tooling, Firefox harness, and platform probes

The add-on's sort and auto-close designs rest on Firefox behaviors the docs don't pin down. Prove them first. If a
gate below fails, stop and report the evidence to the owner before Task 2.

**Files:**

- Create: `package.json`, `biome.json`, `tsconfig.json`, `web-ext-config.mjs`, `manifest.json` (minimal)
- Create: `tests/firefox/harness.js`, `tests/firefox/probes/manifest.json`, `tests/firefox/probes/probe.js`,
  `tests/firefox/probes/page.html`, `tests/firefox/probes/result.html`, `tests/firefox/probes.test.js`
- Create: `docs/superpowers/notes/2026-11-06-firefox-probes.md`
- Modify: `.gitignore` (already has `node_modules/`, `web-ext-artifacts/`, `.superpowers/`, `.rumdl_cache/`)

**Interfaces:**

- Produces:
  - `launchFirefox({ extensions: string[], uuids?: Record<string,string> }) → Promise<{ send(method: string,
    params?: object): Promise<object>, contexts(): Promise<{context: string, url: string}[]>, close():
    Promise<void> }>`. It installs each path with BiDi `webExtension.install`.
  - `startServer() → { origin: string, stop(): void }`:
    - Every path returns `<title>PATH</title>`, where PATH is the requested path plus its query.
    - `/go?to=/a` answers `302 Location: /a`.
  - `TEST_UUID = "6f3b2b52-1d7e-4f1a-9c2e-0e5e8d3c7a11"`, mapped to `essential-tabs-toolbox@labinator.com`.
  - `waitFor(fn, { timeout = 10000, interval = 100 })`.
- [ ] **Step 1: Tooling files.**
  - `package.json`:
    - `"type": "module"`, `"version": "1.0.0"`.
    - devDependencies: `@biomejs/biome@^2.6.5`, `typescript@^7.0.2`, `@types/firefox-webext-browser@^143.0.1`,
      `web-ext@^10.8.0`, `rumdl@^0.2.79`.
    - Scripts:
      - `lint`: `biome check .`
      - `lint:md`: `rumdl check .`
      - `typecheck`: `tsc --noEmit`
      - `test:unit`: `bun test tests/unit`
      - `test:firefox`: `bun test tests/firefox --timeout 120000`
      - `validate`: `web-ext lint --self-hosted=false`
      - `test`: `bun run lint && bun run lint:md && bun run typecheck && bun run test:unit && bun run validate &&
        bun run test:firefox`
      - `build`: `web-ext build --overwrite-dest`
  - `biome.json`: copy `../quick-youtube-summary-with-gemini/biome.json` (schema 2.6.5, `!**/*.md` excluded), with
    `javascript.globals: ["browser"]`.
  - `tsconfig.json`: `allowJs`, `checkJs`, `noEmit`, `strict: false`, `module/moduleResolution: "nodenext"`,
    `types: ["firefox-webext-browser"]`, `include: ["src/**/*.js"]`.
  - `web-ext-config.mjs`: `ignoreFiles` for `tests`, `docs`, `.superpowers`, `node_modules`, `package.json`,
    `bun.lock`, `biome.json`, `tsconfig.json`, `.rumdl.toml`, `*.md`, `web-ext-config.mjs`.
  - Minimal `manifest.json`: the global constraints plus `background: { scripts: ["src/background.js"],
    type: "module" }` and an empty `src/background.js`.
- [ ] **Step 2: Run `bun install && bun run lint && bun run validate`.** Expected: all pass with 0 errors.
- [ ] **Step 3: Write `tests/firefox/harness.js`.**
  - Spawn `firefox --headless --no-remote --profile <tmpdir> --remote-debugging-port 0`. Parse stderr for
    `WebDriver BiDi listening on (ws://\S+)` and connect a `WebSocket` to `<that>/session`, then call
    `session.new {capabilities:{}}`.
  - Write `user.js` into the temp profile with:
    - `extensions.webextensions.uuids` set to `JSON.stringify(uuids)`;
    - `browser.shell.checkDefaultBrowser=false`;
    - `browser.startup.homepage_override.mstone="ignore"`;
    - `datareporting.policy.dataSubmissionEnabled=false`;
    - `browser.tabs.groups.enabled=true`.
  - `close()` calls `browser.close` and removes the profile directory.
- [ ] **Step 4: Write the probe extension and `tests/firefox/probes.test.js`.**
  - The probe manifest is MV3 with `permissions: ["tabs","sessions","cookies"]` and id `probe@labinator.test`.
  - On `runtime.onInstalled`, `probe.js` runs the scenarios below and records results. It then opens
    `result.html#<encodeURIComponent(JSON)>`; the test finds that context through `contexts()` and parses the hash.
  - **P1 — leftward moves keep group membership.** Build the window `[u0, g1, g2, g3, u1, u2]`, with g1–g3 put
    in one group by `tabs.group`. Run each move from a fresh layout and record every tab's `groupId` after it:
    - `E1`: g3 → index of g1.
    - `E2`: g3 → index of g2.
    - `E3`: u2 → index of g1, so an ungrouped tab passes over the group to the slot left of it.
    - `E4`: u2 → index of u1, the slot right after the group.
    - Pass: no tab's group membership changed in any case.
  - **P2 — BiDi can script an extension page.** Open `moz-extension://<probe uuid>/page.html` in a tab, then run
    `script.evaluate` of `typeof browser.tabs.query` in it. Pass: it returns `"function"`.
  - **P3 — a restored tab is recognizable at its first event.**
    - Open `page.html` in a new tab and `sessions.setTabValue(id, "seen", true)`. Close it, then
      `sessions.restore()`.
    - For the restored tab, log the `tabs.onCreated` fields (`url`, `status`, `discarded`, `openerTabId`) and
      `getTabValue("seen")` at `onCreated` and at every `onUpdated`.
    - Log the same for a brand-new `tabs.create({ url: "page.html" })` tab.
    - Pass: `getTabValue` returns `true` for the restored tab no later than its first `onUpdated` with
      `status: "complete"`, and returns `undefined` for the new tab.
  - **P4 — does clearing history empty Recently closed?** Close two `page.html` tabs and record
    `sessions.getRecentlyClosed()`. Then call `browsingData.removeHistory({})` (probe-only `browsingData`
    permission) and record it again.
    - This is a fact to document, not a gate. `removeHistory` is the closest automatable stand-in for Firefox's
      "Clear history"; Task 9's checklist also verifies the real menu.
- [ ] **Step 5: Run `bun run test:firefox`.** Expected: P1, P2 and P3 pass, and P4 is recorded. On failure, read
  the logged results before changing anything.
- [ ] **Step 6: Record decisions in `docs/superpowers/notes/2026-11-06-firefox-probes.md`.**
  - Paste the raw results, then one decision line per probe:
    - P1 pass → Task 4 applies moves as planned. P1 fail → Task 4's apply step re-asserts membership (described
      there).
    - P2 pass → Tasks 5–7 drive the real popup by `script.evaluate`. P2 fail → those e2e steps become manual
      `TESTING-CHECKLIST.md` items.
    - P3 pass → auto-close marks tabs with `sessions.setTabValue(tabId, "ett-seen", true)`.
    - P3 fail → **stop and report**. Auto-close needs a different restore signal, and that is an owner decision.
    - P4 → one sentence for the README and spec §2.6 saying whether clearing history clears Recently closed.
  - Browser restart (session restore at startup) cannot be automated: temporary add-ons are removed at shutdown,
    and release Firefox can't install unsigned add-ons permanently. It goes to `TESTING-CHECKLIST.md` in Task 9.
- [ ] **Step 7: Commit** `chore: tooling, Firefox BiDi harness, platform probes` and push.

### Task 2: URL rules

**Files:**

- Create: `src/lib/rules.js`, `tests/unit/url-rules.test.js`

**Interfaces:**

- Produces (all exported from `src/lib/rules.js`):
  - `duplicateKey(url: string): string | null`
  - `siteKey(url: string): string | null`
  - `compareUrls(a: string, b: string): number`
  - `parseLinks(text: string): { urls: string[], rejected: string[] }`
  - `isWebUrl(url: string): boolean`: true for `http:` and `https:` only.

- [ ] **Step 1: Write the failing tests.**

```js
import { expect, test } from 'bun:test';
import { compareUrls, duplicateKey, parseLinks, siteKey } from '../../src/lib/rules.js';

test('duplicateKey drops fragment and one trailing slash, keeps query', () => {
  expect(duplicateKey('https://a.com/x/#top')).toBe(duplicateKey('https://a.com/x'));
  expect(duplicateKey('https://a.com/')).toBe(duplicateKey('https://a.com'));
  expect(duplicateKey('https://a.com/watch?v=abc')).not.toBe(duplicateKey('https://a.com/watch?v=xyz'));
  expect(duplicateKey('HTTPS://A.COM/x')).toBe(duplicateKey('https://a.com/x'));
});
test('duplicateKey is null for non-web urls', () => {
  for (const u of ['about:newtab', 'about:blank', 'about:reader?url=https://a.com', 'file:///x', 'moz-extension://id/p.html', 'view-source:https://a.com'])
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
  const urls = ['about:config', 'https://www.Github.com/b', 'http://apple.com/', 'https://github.com/a', 'file:///a'];
  expect([...urls].sort(compareUrls)).toEqual(['http://apple.com/', 'https://github.com/a', 'https://www.Github.com/b', 'about:config', 'file:///a']);
});
test('parseLinks: bare domains get https, junk is rejected, wrapping punctuation stripped, in-list duplicates dropped', () => {
  const r = parseLinks('example.com\n(https://a.com/x),\t<https://b.com>\n\nHTTPS://C.com hello about:config https://a.com/x#y javascript:alert(1)');
  expect(r.urls).toEqual(['https://example.com/', 'https://a.com/x', 'https://b.com/', 'https://c.com/']);
  expect(r.rejected).toEqual(['hello', 'about:config', 'javascript:alert(1)']);
});
```

- [ ] **Step 2: Run `bun test tests/unit/url-rules.test.js`.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement the five functions in `src/lib/rules.js`.**
  - Normalize URLs with the `URL` class.
  - `parseLinks` splits on `/\s+/` and strips leading `([<"'` and trailing `)]>"'.,;:` from each token.
  - A token without a scheme becomes `https://` + token when it matches
    `/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i`.
  - Accepted URLs are returned in `URL.href` form, de-duplicated by `duplicateKey`, first occurrence kept.
  - The sort key is the lowercased `href` without `scheme://` and without one leading `www.`. Non-web URLs sort
    after every web URL, by their lowercased literal URL.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then `bun run lint && bun run typecheck`.
- [ ] **Step 5: Commit** `feat: URL rules` and push.

### Task 3: List rules — filters, By site, copy text, status lines

**Files:**

- Modify: `src/lib/rules.js`
- Create: `tests/unit/list-rules.test.js`

**Interfaces:**

- Consumes: `siteKey` (Task 2).
- Produces:
  - `filterTabs(tabs: Tab[], filter: 'all'|'pinned'|'notPinned'): Tab[]`
  - `groupBySite(tabs: Tab[]): { sites: { site: string, tabs: Tab[] }[], other: Tab[] }`
  - `copyText(tabs: Tab[]): string`
  - `copiedMessage(n: number): string`
  - `openStatus(r: { opened: number, alreadyOpen: number, rejected: number }): string`
  - `Tab` is the subset `{ id, index, url, title, pinned, groupId, favIconUrl, incognito, cookieStoreId, audible,
    sharingState }` of `browser.tabs.Tab`. Define it as a JSDoc typedef in `rules.js`.
- [ ] **Step 1: Write the failing tests.** Build `tabs` with a helper `t(id, url, extra)`.
  - `filterTabs`: `pinned`/`notPinned` split on `tab.pinned`; `all` returns the input order unchanged.
  - `groupBySite` with youtube ×3 (one `www.`, one `m.`), github ×2, mozilla ×1, `about:config` ×1:
    - `sites` equals `[{site:'youtube.com'}, {site:'github.com'}]` (count descending, then name ascending).
    - `other` holds the mozilla tab and the `about:config` tab, in tab order.
    - A tie of 2 and 2 is ordered by name.
    - Pinned tabs are included.
  - `copyText([a, b])` is `a.url + '\n' + b.url`, with no trailing newline.
  - `copiedMessage(1)` is `'Copied 1 URL'`; `copiedMessage(50)` is `'Copied 50 URLs'`.
  - `openStatus`:
    - `{12,3,1}` → `'Opened 12 · 3 already open · 1 not a link'`
    - `{0,0,2}` → `'2 not links'`
    - `{0,0,0}` → `'Nothing to open'`
    - `{1,0,0}` → `'Opened 1'`
- [ ] **Step 2: Run `bun test tests/unit/list-rules.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement the five functions in `src/lib/rules.js`.**
- [ ] **Step 4: Run all unit tests, lint and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: list rules` and push.

### Task 4: Sort by URL inside tab groups

**Files:**

- Modify: `src/lib/rules.js`
- Create: `src/popup/actions.js`, `tests/unit/sort.test.js`, `tests/firefox/sort.test.js`

**Interfaces:**

- Consumes: `compareUrls` (Task 2).
- Produces:
  - `planSort(tabs: Tab[]): { id: number, index: number }[]`, in `rules.js`. It returns the complete target
    order for the non-pinned tabs, ascending by `index`.
  - `sortWindow(windowId: number): Promise<void>`, in `actions.js`.
- [ ] **Step 1: Write the failing unit tests.**
  - The spec §2.5 example: `[u1, G1:(z,y), u2, u3, G2:(c,a), u4]`, with ungrouped URLs `u1=d`, `u2=b`, `u3=e`,
    `u4=a`.
    - Group 1 slots receive `y, z`; group 2 slots receive `a, c`.
    - The ungrouped slots, in order, receive `a, b, d, e`.
    - Each tab keeps its own `groupId`.
  - Pinned tabs are absent from the output and their indices are untouched.
  - The sort is stable: two tabs with an equal key keep their relative order.
  - An all-sorted window returns targets equal to the current indices.
  - Tabs with `groupId === undefined` are treated as ungrouped (`-1`).
- [ ] **Step 2: Run `bun test tests/unit/sort.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `planSort`.** Partition the non-pinned tabs by `groupId`. Stable-sort each partition by
  `compareUrls(a.url, b.url)`, then write it back into that partition's original index slots.
- [ ] **Step 4: Implement `sortWindow(windowId)` in `actions.js`.**
  - Query `{ windowId }`, then call `planSort`.
  - Walk the targets in ascending index order and `await browser.tabs.move(id, { index })` only when the tab's
    current index differs. Each move is leftward, so slots already placed stay fixed.
  - If Task 1 recorded P1 as failed: afterwards, re-query the window and restore any changed `groupId` with
    `tabs.group({ tabIds, groupId })` (or `tabs.ungroup`). Then assert that the order matches the plan.
- [ ] **Step 5: Write `tests/firefox/sort.test.js`.**
  - Install the add-on with `TEST_UUID` and open the server pages `/d /z /y /b /e /c /a /a2`.
  - From an extension page (P2), call `browser.tabs.group` to make `G1 = {/z, /y}` and `G2 = {/c, /a}`, giving
    the spec example layout.
  - Run `import('/src/popup/actions.js').then(m => m.sortWindow(windowId))` in that page.
  - Assert the final URL order, each tab's `groupId`, and that pinned tabs are untouched (pin one with
    `tabs.update({ pinned: true })` first).
  - If P2 failed, replace this step with a `TESTING-CHECKLIST.md` item.
- [ ] **Step 6: Run the unit tests and `bun run test:firefox`.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: sort by URL inside tab groups` and push.

### Task 5: Auto-close duplicates

**Files:**

- Modify: `src/lib/rules.js`, `src/background.js`, `manifest.json`
- Create: `src/lib/settings.js`, `tests/unit/duplicates.test.js`, `tests/firefox/duplicates.test.js`

**Interfaces:**

- Consumes: `duplicateKey` (Task 2); the P3 decision (Task 1).
- Produces:
  - `isProtected(tab: Tab): boolean`
  - `olderDuplicatesToClose(newTab: Tab, tabs: Tab[]): number[]`
  - `DEFAULTS = { autoCloseDuplicates: false, lastFilter: 'all' }`, `getSettings(): Promise<typeof DEFAULTS>` and
    `setSetting(key, value): Promise<void>`, in `settings.js`.
- [ ] **Step 1: Write the failing unit tests.**
  - `isProtected` is true for each of: `pinned`; `audible`; `sharingState.camera`, `.microphone` or `.screen`;
    `groupId >= 0`. It is false for a plain tab and for `groupId: -1` or `undefined`.
  - `olderDuplicatesToClose(newTab, tabs)` returns the ids of tabs that:
    - have the same `duplicateKey`;
    - have `id < newTab.id`;
    - share the same `incognito` and `cookieStoreId`;
    - and are not protected.
  - It never returns `newTab.id`. It returns `[]` when `duplicateKey(newTab.url)` is null.
  - Cases: two older copies → both ids; one pinned plus one plain → only the plain id; an older copy in another
    container → `[]`; a private versus a normal tab → `[]`.
  - The race case: tabs 7 and 8 both new with the same URL. Checking 7 returns `[]`; checking 8 returns `[7]`.
- [ ] **Step 2: Run `bun test tests/unit/duplicates.test.js`.** Expected: FAIL. Implement both functions. Run
  again. Expected: PASS.
- [ ] **Step 3: Implement `src/lib/settings.js` and `src/background.js`.**
  - **Marking.** On `runtime.onInstalled` and `runtime.onStartup`, set the marker on every existing tab
    (`sessions.setTabValue(id, 'ett-seen', true)`). Also store `graceUntil = Date.now() + 10000` in
    `storage.session`.
  - **Trigger.** On `tabs.onUpdated`, filtered to `properties: ['status']`:
    - Act only on `changeInfo.status === 'complete'` with `isWebUrl(tab.url)`. Using the post-redirect URL handles
      redirects.
    - Return if the setting is off.
    - Return if `getTabValue(id, 'ett-seen')` is truthy.
    - Otherwise set the marker first (each tab is checked exactly once). Return if `Date.now() < graceUntil`.
    - Then `tabs.query({})`, `olderDuplicatesToClose`, `tabs.remove(ids)`.
  - **Navigating in place.** A tab marked earlier never re-checks, so a tab you're using that navigates to a page
    open elsewhere is left alone.
  - **Badge.** Add the closed count to an in-memory counter: `action.setBadgeText({ text: String(n) })` with
    background `#2400ff`. Reset to `''` 4000 ms after the last close.
  - **No focus changes** of any kind.
  - Manifest: add `sessions`, `action: { default_title: "Essential Tabs Toolbox" }` and `icons` (the
    placeholder `icon.svg` is replaced in Task 9).
- [ ] **Step 4: Write `tests/firefox/duplicates.test.js`.** Use the server pages. "Open" means BiDi
  `browsingContext.create {type:'tab'}` plus `navigate` with `wait:'complete'`. Wait about 1 s, then read
  `contexts()`. Turn the setting on through `browser.storage.local.set` in an extension page (P2) or, if P2 failed,
  by clicking the popup switch with BiDi input actions. Scenarios:
  - `D1`: on; `/a` open; open `/a` again → the older context is gone, the new one remains.
  - `D2`: on; `/a` and `/b` open; navigate the `/b` context to `/a` → both remain.
  - `D3`: setting left at its default → opening `/a` twice keeps both.
  - `D4`: on; `/a#x` open; open `/a` → the older one closes.
  - `D5`: on; `/a?v=1` open; open `/a?v=2` → both remain.
  - `D6`: off; open `/a` twice; turn on; open `/b` → both `/a` remain.
  - `D7`: on; `/a` open; open `/go?to=/a` → the older `/a` closes and the redirected tab remains.
  - `D8`: on; `/a` open, then `tabs.remove` it and `sessions.restore()` from the extension page while a newer
    `/a` is open → the restored tab never triggers a close.
- [ ] **Step 5: Run `bun run test`.** Expected: all pass.
- [ ] **Step 6: Commit** `feat: auto-close duplicates (off by default)` and push.

### Task 6: Popup — list, filters, By site, copy, sort, switch

**Files:**

- Create: `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`, `tests/firefox/popup.test.js`
- Modify: `manifest.json` (`action.default_popup: "src/popup/popup.html"`), `src/popup/actions.js`

**Interfaces:**

- Consumes: `filterTabs`, `groupBySite`, `copyText`, `copiedMessage` (Task 3); `sortWindow` (Task 4);
  `getSettings` and `setSetting` (Task 5).
- Produces: `focusTab(tab: Tab): Promise<boolean>` in `actions.js`. It activates the tab and focuses its window,
  and resolves `false` if the tab no longer exists.
- DOM contract for the e2e tests:
  - Filter buttons: `[data-filter="all|pinned|notPinned|bySite"]`, with `aria-pressed`.
  - List rows: `#list .row[data-tab-id]`.
  - Site rows: `#list .site[data-site]`, each with a `.copy` button; the `Other sites` row has `data-site="*other"`.
  - A drilled-in site view shows `#back`.
  - Other controls: `#copy`, `#sort`, `#dup-switch` (`role="switch"`, `aria-checked`), and `#toast` for
    `Copied …` and `Sorted`.
- [ ] **Step 1: Write `tests/firefox/popup.test.js`.** Open the server pages (youtube-like hosts are unnecessary;
  use `/a?1` … through the server's two hostnames, `127.0.0.1` and `localhost`, to make two sites). Then open
  `moz-extension://TEST_UUID/src/popup/popup.html` in a tab of the same window and assert:
  - `P1`: the `#list .row` count equals the window's tab count, and the filter buttons' text is exactly
    `All`, `Pinned`, `Not pinned`, `By site`.
  - `P2`: `bySite` shows a `.site` row per host with 2 or more tabs, plus the `*other` row when there are
    single-tab sites. `#copy` is hidden at this level.
  - `P3`: clicking a site shows `#back` and only that site's rows. `#copy` is visible.
  - `P4`: a BiDi input click on `#copy` shows `#toast` reading `Copied N URLs`.
  - `P5`: clicking `#dup-switch` flips `aria-checked` and `storage.local.autoCloseDuplicates`. Reopening the
    popup keeps both the switch state and `lastFilter`.
  - `P6`: close a listed tab with BiDi, then click its row → the row is removed, no console error, the popup
    still works.
  - `P7`: with 300 tabs, `performance.now()` at the first list paint (set by `popup.js` as
    `document.body.dataset.renderedMs`) is `< 150`.
- [ ] **Step 2: Run it.** Expected: FAIL (no popup).
- [ ] **Step 3: Build the popup to spec §4 and the Global Constraints.**
  - Layout from top to bottom: header (`Sort A→Z`), paste box area (an empty `<section id="paste">`, filled in
    Task 7), filter row, scrolling `#list`, footer (`#dup-switch` + `#copy`).
  - Width 360 px; the list's max height keeps the popup under 600 px.
  - Rows show a favicon `<img>` only when `favIconUrl` starts with `https:`, `http:` or `data:`; otherwise a
    blank 14 px square. Then the title, and the URL on a second line.
  - Clicking a row or pressing `Enter` calls `focusTab` and then `window.close()`. If `focusTab` returns `false`,
    remove the row.
  - `Sort A→Z` calls `sortWindow`, re-renders, and toasts `Sorted`.
  - Keys: `Alt+1`…`Alt+4` select filters. The paste box gets initial focus (it's a placeholder `<textarea>`
    until Task 7).
  - Re-render on `tabs.onCreated`, `onRemoved`, `onUpdated` and `onMoved` while the popup is open.
- [ ] **Step 4: Run `bun run test`.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: popup list, filters, by-site, copy, sort` and push.

### Task 7: Paste box — open links

**Files:**

- Modify: `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/actions.js`
- Create: `tests/firefox/paste.test.js`

**Interfaces:**

- Consumes: `parseLinks`, `duplicateKey`, `openStatus` (Tasks 2–3).
- Produces: `openLinks(text: string): Promise<{ opened: number, alreadyOpen: number, rejected: string[] }>` in
  `actions.js`.
- [ ] **Step 1: Write `tests/firefox/paste.test.js`.** With `/a` already open, set the textarea to
  `"/b\n<origin>/a\nnot-a-link <origin>/b"` (origin-qualified). Then click `Open` and assert:
  - Exactly one new tab, `/b`, at the end of the window. It is not active and is created `discarded`.
  - Its `cookieStoreId` equals the active tab's.
  - `#paste-status` reads `Opened 1 · 1 already open · 1 not a link`.
  - The textarea now contains only `not-a-link`.
  - `Ctrl+Enter` in the textarea behaves the same as clicking `Open`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `openLinks`.**
  - Get the active tab of the current window. Its `cookieStoreId` and `incognito` define the scope.
  - Collect `duplicateKey`s of all tabs with the same `incognito` and `cookieStoreId`, across all windows. Skip
    links in that set.
  - Create the rest in paste order with `browser.tabs.create({ url, active: false, discarded: true, title: url,
    cookieStoreId, windowId })`.
  - Count `tabs.create` rejections as rejected links.
  - The popup renders `openStatus(...)` into `#paste-status` and leaves only the rejected tokens in the box, one
    per line.
- [ ] **Step 4: Run `bun run test`.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: paste box opens links` and push.

### Task 8: Recently closed

**Files:**

- Modify: `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/actions.js`, `src/lib/rules.js`
- Create: `tests/unit/closed.test.js`, `tests/firefox/closed.test.js`

**Interfaces:**

- Consumes: `copyText`, `copiedMessage` (Task 3); the popup DOM contract (Task 6).
- Produces:
  - `flattenClosed(sessions: browser.sessions.Session[]): { sessionId: string, url: string, title: string,
    favIconUrl?: string }[]` in `rules.js`. It flattens `session.tab` and every `session.window.tabs[]` in input
    order (newest first), and keeps each tab's own `sessionId`.
  - In `actions.js`: `recentlyClosed(): Promise<ReturnType<typeof flattenClosed>>` and
    `restoreClosed(sessionId: string): Promise<boolean>`. `restoreClosed` resolves `false` if the entry is gone.
- DOM: `#closed` (the header button), `#list .row[data-session-id]`, `#back`, and `#empty` reading
  `No recently closed tabs`.
- [ ] **Step 1: Write the failing unit test.** `flattenClosed` on `[{tab:{sessionId:'t1'}}, {window:{tabs:
  [{sessionId:'w1a'},{sessionId:'w1b'}]}}, {tab:{sessionId:'t2'}}]` returns the session ids
  `['t1','w1a','w1b','t2']`.
- [ ] **Step 2: Write `tests/firefox/closed.test.js`.** Open server pages `/a` and `/b`, then close both with
  BiDi. Open the popup page and click `#closed`. Assert:
  - two rows, `/b` first;
  - the filter row is hidden and `#back` is shown;
  - clicking the `/a` row restores a tab whose URL is `/a`;
  - `#copy` toasts `Copied 2 URLs` before the restore;
  - before anything is closed (fresh profile), clicking `#closed` shows `#empty`.
- [ ] **Step 3: Run both tests.** Expected: FAIL. Implement `flattenClosed`, the two actions and the view:
  - `#closed` swaps the list.
  - A row click calls `restoreClosed`, then `window.close()`. On `false`, remove the row.
  - `#back` returns to the last filter.
- [ ] **Step 4: Run `bun run test`.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: recently closed tabs` and push.

### Task 9: Icon, docs, release build

**Files:**

- Create: `icon.svg`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `TESTING-CHECKLIST.md`, `CHANGELOG.md`
- Modify: `manifest.json`
- [ ] **Step 1: Draw `icon.svg` in the Labinator icon system.**
  - Copy the structure of `../lightweight-tabs-unloader/icon.svg`: a 128 viewBox, `<title>`, a full `#2400ff`
    rect, and white glyph paths. The glyph: three stacked browser-tab outlines, or a toolbox, with at most three
    solid shapes.
  - Render it at 16 px and 128 px with `rsvg-convert`, and check it beside the other Labinator icons at 16 px.
    It must read as distinct.
  - Wire it into `icons` and `action.default_icon` at 16/32/48/96/128.
- [ ] **Step 2: Write the docs**, following `../youtube-uninterrupted` as the model. `TESTING-CHECKLIST.md` must
  include:
  - browser restart with session restore and auto-close on: no restored tab closed;
  - pinned, playing-audio, camera-sharing and grouped older copies survive;
  - container and private-window scope;
  - real clipboard contents after `Copy`;
  - the 16 px toolbar icon on light and dark themes;
  - keyboard-only use of the popup;
  - Recently closed after Firefox's own "Clear history" (History menu), compared with the P4 result.

  `SECURITY.md` states the Firefox 159 floor. `CHANGELOG.md` gets a `1.0.0` entry.
- [ ] **Step 3: Run `bun run test && bun run build`.** Expected:
  - all gates pass;
  - `web-ext-artifacts/essential_tabs_toolbox-1.0.0.zip` exists;
  - `unzip -l` lists only `manifest.json`, `icon.svg`, `LICENSE` and `src/**`.
- [ ] **Step 4: Commit** `docs: v1.0.0 docs, icon, checklist` and push.
