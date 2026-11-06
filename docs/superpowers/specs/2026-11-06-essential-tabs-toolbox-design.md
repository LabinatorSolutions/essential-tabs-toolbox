# Essential Tabs Toolbox — Design

Date: 2026-11-06. Status: approved by the owner, 2026-11-06.

Labels: **[owner]** = decided by the owner in conversation. **[call]** = proposed by Claude, not
objected to, open to change. Anything unlabeled follows from an [owner] decision.

## 1. Intent

A Labinator Firefox add-on for fast tab housekeeping. Every job is one or two clicks away from the
toolbar button.

The motivating case **[owner]**: a window with ~100 tabs, of which ~50 are YouTube videos inside a
tab group. Today the owner copies every URL out of Firefox and filters the YouTube ones by hand.
The add-on has to make "copy every tab from one site" a single click.

Success looks like this:

- Pasting a list of links opens them all, without opening tabs the user already has.
- The user can see and copy their open tabs, filtered, without leaving the popup.
- Duplicate tabs stop piling up, without the add-on ever closing a tab the user wanted.
- One click sorts the tab strip by URL, and tab groups stay intact.

## 2. Features

### 2.1 Open a pasted list of links **[owner]**

- The paste box is **always visible at the top of the popup [owner]**, with an **Open** button
  beside it. `Ctrl+Enter` in the box also opens **[call]**.
- Parsing **[call]**:
  - Split on whitespace and newlines.
  - Accept `http://` and `https://` URLs. A bare domain or host-plus-path (`example.com`,
    `example.com/a`) gets `https://` added. Reject everything else (`about:`, `file:`,
    `javascript:`, `data:`, plain words), because Firefox refuses most of these from extensions.
  - Drop duplicates inside the pasted list, comparing by the duplicate key (§3.1).
  - **Skip links already open [call, accepted]**, by duplicate key. The scope matches the
    duplicate rule (§2.4 rule 5): all windows of the same kind (normal or private) as the current
    window, in the same container the links will open in. Nothing opens and then auto-closes.
- Tabs open in the **current window, in the background (`active: false`), appended at the end, in
  paste order [call]**. If a new tab took focus, the popup would close.
- **Container [call]**: links open in the active tab's container (its `cookieStoreId` is passed to
  `tabs.create`). Pasting from inside a "Work" container tab therefore opens the links in "Work".
- After opening, one status line appears under the box, for example `Opened 12 · 3 already open ·
  1 not a link` **[call]**. Opened, already-open and repeated links are cleared from the box.
  Only rejected links stay, so the user can fix them **[call]**.
- No upper limit on the count **[call]**.
- **Pasted tabs load when first clicked [owner]**: they are created unloaded (`discarded: true`),
  so pasting 50 links costs no CPU, memory or network until each one is opened. Until then each
  tab shows its URL as its title. They are created already skipped against open tabs, so the
  duplicate rule has nothing to do for them.

### 2.2 List, view and copy open tabs **[owner]**

- **Scope: the current window only [call, accepted]**.
- **Filters: `All · Pinned · Not pinned · By site` [owner]**. The filter buttons show **no counts
  [owner]**: "the interface will look ugly", and the user learns the count when copying.
- **Rows**: favicon, title, and URL on a second line, in tab-strip order **[call]**. Clicking a row
  or pressing `Enter` on it switches to that tab **[call]**. No close buttons in v1 (§5).
- **Copy**:
  - One **Copy** button in the footer copies the URLs of whatever the current view shows, one URL
    per line **[call, accepted]**. In `All`, that includes pinned tabs.
  - **Every copy is clean [owner]**: known tracking parameters (§3.3) are removed, and everything
    else in the URL is kept. No setting.
  - The button label shows no number **[owner, by extension of the no-counts rule]**.
  - A confirmation names the count: `Copied 50 URLs` **[owner: "he is gonna know the number
    anyway"]**.
- The popup remembers the last filter used **[call]**.

### 2.3 By site view **[owner]**

- **One row per site that has 2 or more tabs** in the current window **[owner]**. A site with a
  single tab gets no row of its own.
- Rows are ordered by tab count, biggest first, then by name **[call]**. Each row shows the site
  name, its tab count, and its own **Copy** button **[call, accepted]**. This is the only place in
  the UI where a count appears.
- Clicking a site's name opens that site's tabs as a list. The list has a header row with a back
  arrow, the site name and a Copy button. The footer Copy copies the same set **[call]**.
- On the site-rows level itself, the **footer Copy is hidden [call]**. Each row has its own Copy,
  and "copy everything" already lives under `All`. One button never means two different sets.
- **Single-tab sites** are gathered into one last row, `Other sites`, which opens and copies like a
  site row **[owner]**.
- **Site key [call, accepted]**: the URL's hostname, lowercased, with one leading `www.` or `m.`
  removed. `youtu.be` stays a separate site from `youtube.com`, because no alias list is kept.
  Tabs that are not `http(s)` (`about:`, `moz-extension:`, `file:`) go to `Other sites`.
- Pinned tabs are included in By site **[call]**.

### 2.4 Close duplicate tabs automatically **[owner]**

- **Off by default [owner, changed at approval]**, with one switch in the footer to turn it on.
  Someone who installs the add-on for paste and copy should not find tabs disappearing unannounced.
  **There is no on-demand "close duplicates now" action [owner]**, because Firefox's own tab
  context menu already has "Close Duplicate Tabs".
- Rules **[call, all accepted by the owner as "All good!"]**:
  1. **Only newly opened tabs trigger a check.** A tab triggers once, when its first real page has
     loaded. That includes tabs opened from a link, a typed URL or a bookmark in a fresh tab
     **[owner]**. A tab the user is already using that navigates to a page open elsewhere never
     triggers a check.
  2. **The new tab is kept; the older copy is closed [owner]**. The user never sees the tab they
     just opened disappear: "he would assume that there is a glitch in his browser". Focus is never
     moved. If several older copies exist, all of them close, subject to rule 3.
  3. **Protected older tabs are never closed [call]**. When an older copy is protected, it stays
     and the new tab stays too:
     - pinned tabs;
     - tabs playing audio;
     - tabs using the camera, microphone or screen sharing (the same guard as Lightweight Tabs
       Unloader);
     - **tabs inside a tab group [owner]**. The group stays exactly as the user built it, and
       nothing moves in front of the user. Firefox's own on-demand "Close Duplicate Tabs" cleans
       those up if the user wants.

     The principle behind rules 2 and 3 **[owner]**: auto-close must never make anything jump in
     the user's face. When in doubt, it leaves both tabs open.
     A closed tab is recoverable with Firefox's Reopen Closed Tab (`Ctrl+Shift+T`).
  4. **Duplicate key**: the clean URL (§3.3) with the `#fragment` removed, one trailing `/` on
     the path ignored, and the remaining query parameters put in a fixed order. Other query
     parameters count (`?id=1` ≠ `?id=2`) **[owner: ignoring the whole query would close tabs that
     are different pages]**. **YouTube videos compare by video ID only [owner]**:
     `youtube.com/watch?v=ID` with any timestamp, playlist or other parameter, and `youtu.be/ID`,
     all count as the same video. Only `http(s)` tabs take part.
     `about:newtab`, `about:home` and `about:blank` are never duplicates.
  5. **Scope**: all windows. Private and normal tabs are never compared. Tabs in different
     containers (`cookieStoreId`) are never compared.
  6. **Duplicates that already exist are left alone.** Turning the switch on does not sweep the
     existing tabs.
  7. **Visible sign**: when a tab is closed this way, the toolbar badge shows how many were closed,
     and clears after about 4 seconds **[call]**.
- **Anti-goal (hard rule)**: tabs restored at browser start-up (session restore), and tabs
  restored with "Reopen closed tab", must never trigger a check. "Newly opened" means a tab
  created by the user's action during the session, never a restored one. Otherwise, restoring a
  session could close a large share of it.

### 2.5 Sort non-pinned tabs by URL **[owner]**

- **On demand only**: a **Sort A→Z** button in the popup header **[owner]**. There is **no
  automatic sorting [owner]**: "it's gonna be messy for users when they see things sorted in front
  of them".
- **Sort key: URL only [owner]**. Ascending. Comparison detail **[call]**: case-insensitive, with
  the scheme (`http://`, `https://`) and one leading `www.` ignored for comparison, so `http` and
  `https` tabs of one site sit together. Ties keep their current relative order (stable sort).
- **Scope: the current window's non-pinned tabs [call, accepted]**. The pinned tabs stay where
  they are.
- **Tab groups [owner]**: "sort inside each group".
  - Each tab group's tabs are sorted among themselves, within the index range the group already
    occupies.
  - Ungrouped tabs are sorted among themselves and refilled into the positions ungrouped tabs held
    before the sort. Example: `[u1, G1…, u2, u3, G2…, u4]` keeps G1 and G2 exactly where they are,
    and the four `u` positions receive the sorted ungrouped tabs in order **[call]**.
  - No tab ever leaves its group, joins a group, or changes window.
- Tabs that are not `http(s)` (`about:`, `file:`, `moz-extension:`) sort after all `http(s)` tabs
  in their segment, by their literal URL **[call]**.
- After a sort, the popup shows `Sorted` briefly. No count, per the no-numbers rule **[call]**.

### 2.6 Recently closed tabs **[owner, added after approval]**

- **Why [owner]**: speed. Firefox's own list (History → Recently Closed Tabs, Firefox View) takes
  several clicks through menus; the owner wants it in the same popup.
- A **Recently closed** button in the popup header swaps the list for Firefox's recently closed
  tabs, newest first **[call]**. A `#back` row returns to the normal list, and the filter row is
  hidden while this view is open.
- Source: `browser.sessions.getRecentlyClosed()`. This is Firefox's own closed-tabs list, not the
  browsing history. It holds at most 25 entries (`sessions.MAX_SESSION_RESULTS`), and it is
  whatever Firefox keeps: the add-on stores nothing itself. Entries for closed *windows* are
  flattened into their tabs **[call]**.
- Clicking a row restores it with `sessions.restore(sessionId)`, which brings back its back history
  and container, the same as `Ctrl+Shift+T` **[call]**. The restored tab opens where Firefox puts
  it, and the popup closes.
- Footer **Copy** copies the URLs shown, like every other view **[call]**.
- Clearing history **[measured, probe P4]**: `browsingData.removeHistory` emptied the list (7 entries → 0).
  Firefox's own "Clear recent history" menu is verified by hand in `TESTING-CHECKLIST.md`. The add-on adds no
  list of its own that could survive a clear.
- An empty list shows `No recently closed tabs` **[call]**.

## 3. Shared rules

### 3.1 One module for the rules

The URL parsing, duplicate key, site key, sort comparison and group-aware sort planning live in one
shared, DOM-free module. The popup and the background script both use it. It is the part with
automated tests (§6).

### 3.2 Settings

`browser.storage.local`: `autoCloseDuplicates` (default `false`) and `lastFilter` (default `All`).

### 3.3 Clean URLs **[owner]**

"Clean" means the URL with known tracking parameters removed: every `utm_*` parameter, plus
`fbclid`, `gclid`, `gclsrc`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `mc_cid`, `mc_eid`, `igshid`,
`yclid`, `twclid`, `ttclid`, `li_fat_id`, `_ga`, `_gl`, `_hsenc`, `_hsmi`, `mkt_tok`, `srsltid`,
and `si` on YouTube links. Everything else stays, because many sites put the page itself in the
query (search `?q=`, filters, `?page=2`, forum `?t=`). Used by Copy and by the duplicate key.

## 4. Interface

Toolbar popup, about 340 px wide. Layout **[owner picked the always-visible paste box + By site
view]**:

```text
┌──────────────────────────────────────────┐
│ ■ ESSENTIAL TABS [Recently closed][Sort A→Z]│  header
├──────────────────────────────────────────┤
│ [ Paste links to open…        ] [ Open ] │  paste box, always visible
│ Opened 12 · 3 already open               │  status line (only after use)
├──────────────────────────────────────────┤
│ [ All | Pinned | Not pinned | By site ]  │  filters, no counts
├──────────────────────────────────────────┤
│ ▪ Title of the tab                       │
│   example.com/path…                      │  scrolling list
│ ▪ …                                      │
├──────────────────────────────────────────┤
│ ( ) Close duplicates             [ Copy ] │  footer
└──────────────────────────────────────────┘

By site:                                After clicking youtube.com:
│ youtube.com          50  [Copy] │       │ ← youtube.com           [Copy] │
│ github.com           14  [Copy] │       │ ▪ Lo-fi beats to code to       │
│ developer.mozilla.org 9  [Copy] │       │   youtube.com/watch?v=…        │
│ Other sites          21  [Copy] │       │ ▪ …                            │
```

- **The duplicate switch sits in the footer [call]**, one click away. It is the only setting, so
  there is no separate options page.
- **Visual system: Labinator `DESIGN.md` [owner, round 1]**. Source:
  `/home/kai/Downloads/Portal/Bitgit/Labinator/labinator-website/DESIGN.md` (the color tokens are
  in its front matter; see "Colors", "Shapes" and "Iconography"). Reference icons from round 1 are
  in `../lightweight-tabs-unloader/icon.svg` and `../youtube-uninterrupted/icon.svg`: a 128×128
  viewBox, a full `<rect>` plate in `#2400ff`, white glyph paths, and one `icon.svg` used for every
  manifest size (16/32/48/96/128).
  - Colors: paper `#f7f5ef` canvas, ink `#141414` text and buttons, ultramarine `#2400ff` for the
    accent, the focus ring and the switch "on" state, hairline `#e3dfd6` rules, hairline-strong
    `#847e71` control borders.
  - Square cards and rows; buttons with a 2 px radius. No shadows or gradients.
  - Single light theme **[call: DESIGN.md mandates one light theme]**.
  - System font stack: no bundled fonts, to keep the add-on small **[call]**.
  - Text contrast at or above 8:1, per DESIGN.md.
- **Icon**: the Labinator icon system from round 1. A full-bleed `#2400ff` square with a flat white
  glyph, sharp geometry, readable at 16 px. Builder's choice of glyph: a toolbox, or stacked tabs.
- **Keyboard [call]**:
  - The popup opens with focus in the paste box.
  - `Alt+1`…`Alt+4` switch filters. Plain digits would type into the paste box.
  - `Enter` on a row switches to that tab.
  - The Copy button is reachable by `Tab`.
  - Every control has a visible 2 px ultramarine focus ring.
- **Performance target [call]**: the popup is usable within about 150 ms with 300 tabs in the
  window. A plain DOM list is fine at that size.

## 5. Goals, non-goals, anti-goals

**Non-goals (v1):**

- An on-demand "close duplicates now" action **[owner]**.
- Automatic sorting **[owner]**: tabs reordering in front of the user is messy. Sorting is on
  demand only.
- A closed-tabs list of the add-on's own. Recently closed shows Firefox's list only, so clearing
  Firefox data clears it too.
- Listing, copying or sorting across all windows.
- Closing or moving tabs from the list.
- Copy formats other than one URL per line, such as Markdown or "title + URL".
- Rewriting URLs in the address bar **[owner: skipped]**. Stripping the whole query breaks search
  pages, filters and logins, and any version needs access to all websites. Clean Copy plus
  Firefox's own tracking protection cover the need.
- A text filter or search. YouTube channel and home pages are copied together with the videos.
  Raised with the owner, not requested.
- A "copy this tab group" action **[owner]**: Firefox's tab-group menu covers it.
- Chrome support. Firefox for Android **[owner: desktop only]**. When uploading to AMO, tick
  Firefox only, not Firefox for Android.

**Anti-goals** (failure even if everything "works"):

- Closing a tab the user wanted: the tab just opened, a pinned, playing, sharing or grouped older
  copy, a tab in a different container, or a private tab matched against a normal one.
- Auto-close making anything visibly jump: focus changes, tabs disappearing in the user's view.
- Pulling tabs out of, or into, a tab group, or moving tabs between windows.
- Silent failure: every action shows an outcome (status line, `Copied …`, `Sorted`, badge).
- A popup that feels slow or cluttered: counts on filter buttons, for example, are banned.

## 6. Constraints and how it's built

- **Approach [owner]: plain JavaScript, no build step.** It matches Lightweight Tabs Unloader and
  Quick YouTube Summary. AMO reviews exactly what is in the repo. Considered and rejected:
  TypeScript with a compile step (AMO source submission on every release, for little gain at this
  size), and a UI framework such as Preact (unneeded for one list, and adds bundled code).
- **Platform**: Firefox MV3.
  - `strict_min_version: "159.0"`.
  - `id: essential-tabs-toolbox@labinator.com`.
  - `data_collection_permissions: { required: ["none"], optional: [] }`.
  - Author and developer: Labinator, `https://labinator.com/`.
  - Version `1.0.0`.
- **Background**: a non-persistent event page (`background.scripts`). Any state it needs between
  events (such as which tabs are still "new" and unchecked) must survive the page being suspended:
  use `storage.session` or recompute, never module-level variables alone.
- **Permissions, minimum set**:
  - `tabs`: URLs and titles of every tab.
  - `storage`.
  - `sessions`: Recently closed (§2.6), and the restored-tab marker for auto-close if probe P3
    selects it. Install prompt line: "Access recently closed tabs".
  - `cookies`: needed only to pass `cookieStoreId` to `tabs.create` (§2.1). No install warning, and
    without host permissions it can read no cookies.
  - Badge text uses the `action` key, which needs no permission.
  - `groupId` and `cookieStoreId` are on `tabs.Tab` without extra permissions. Tab-group support
    exists since Firefox 138–139.
  - Clipboard: `navigator.clipboard.writeText` from the popup click. Add `clipboardWrite` only if
    Firefox requires it — the builder verifies.
  - No host permissions, no content scripts.
- **Tooling**: Bun, Biome (JS/JSON; Markdown excluded), rumdl (Markdown), web-ext 10.8+, and
  `tsc --checkJs` with `@types/firefox-webext-browser` for type-checking. One `bun run test` gate
  runs all of them plus the unit tests, as the owner's other add-ons do.
- **Tests**:
  - `bun test` unit tests for the shared rules module: URL parsing, duplicate key, site key, sort
    comparison, and group-aware sort planning, including the `[u1, G1…, u2, u3, G2…, u4]` case.
  - A manual `TESTING-CHECKLIST.md` for real-Firefox behavior.
- **Early risk to prove first**: in a real Firefox 159, `tabs.move` of a tab to a new index inside
  its own group's range keeps it in the group, and moving ungrouped tabs past a group does not pull
  them in. If either fails, the sort plan has to change (for example, moving with `tabs.group`
  re-assignment) before the rest is built on it.
- **Repo**: `git@github.com:LabinatorSolutions/essential-tabs-toolbox.git`. The LICENSE is already
  in the remote. Docs follow the owner's other add-ons: README, CONTRIBUTING, SECURITY,
  TESTING-CHECKLIST, CHANGELOG.

## 7. Open questions for the owner

None remain. Settled:

- **Older duplicate inside a tab group**: keep both open **[owner]** (§2.4 rule 3).
- **Tab group copy**: not built **[owner]**. The owner's reason: Firefox's own tab-group context
  menu already covers it.
- **Desktop only [owner]**. No Firefox for Android support.

## 8. Left to the builder

- File layout, module names, and the internal event-handling structure.
- The icon glyph, within the Labinator icon system.
- The exact badge duration, within the stated range.
- How "newly opened" is tracked, provided the session-restore and reopen-closed-tab anti-goal holds.
