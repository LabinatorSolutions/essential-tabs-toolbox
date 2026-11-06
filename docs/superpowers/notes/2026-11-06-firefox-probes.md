# Firefox platform probes — 2026-11-06

Measured in Firefox 159.0.1 (Linux, headless) by `tests/firefox/probes.test.js` driving the probe extension in
`tests/firefox/probes/` over WebDriver BiDi. Notation: `*` marks a tab inside the tab group. The starting layout
for every case is `u0 g1* g2* g3* u1 u2`.

## P1 — tab moves and group membership

| Case | Moves | Result |
|---|---|---|
| E1 | g3 → index of g1 | `u0 g3* g1* g2* u1 u2` |
| E2 | g3 → index of g2 | `u0 g1* g3* g2* u1 u2` |
| E3 | u2 → index of g1 | `u0 u2* g1* g2* g3* u1` — **u2 joined the group** |
| E4 | u2 → index of u1 | `u0 g1* g2* g3* u2 u1` |
| S1 | swap g1↔g3 inside the group | `u0 g3* g2* g1* u1 u2` |
| S2 | swap u0↔u2 across the group | `u2 g1* g2* g3* u1 u0` |
| S3 | swap u1↔u2 next to the group's end | `u0 g1* g2* g3* u2 u1` |

**Decision:** a single `tabs.move` that lands an ungrouped tab at a group's first slot puts it *into* the group
(E3). The sort therefore swaps tabs within their own partition (S1–S3): move A left onto B's slot, then B right
onto A's old slot. Every move lands in a slot whose neighbors match the original layout, and group membership
held in all three swap cases.

## P2 — scripting extension pages from tests

- `script.evaluate` in a `moz-extension://` page needs system access. Since Firefox 159 that is the environment
  variable `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (the old `--remote-allow-system-access` flag was removed).
- With it set, BiDi can also *navigate* a tab straight to `moz-extension://<uuid>/…` (without it: "not allowed
  in this context").

**Decision:** the harness sets the variable for its throwaway headless browser only. E2e tests open the popup
page directly in a tab and script it.

## P3 — restored tabs versus new tabs

- A tab marked with `sessions.setTabValue(id, 'seen', true)`, closed, then brought back with
  `sessions.restore()`, returns `true` from `getTabValue` **already at `tabs.onCreated`** (its URL is still
  `about:blank` at that point), and at every later event.
- A brand-new tab returns `undefined` throughout.

**Decision:** auto-close marks every tab it has seen with `sessions.setTabValue(tabId, 'ett-seen', true)`. A
restored tab arrives with its marker and never triggers a check. Browser restart with session restore is not
automatable (temporary add-ons are removed at shutdown), so it stays a manual checklist item.

## P4 — clearing history and Recently closed

- `sessions.getRecentlyClosed()` returned 7 entries. After `browsingData.removeHistory({})` it returned 0.
- `sessions.MAX_SESSION_RESULTS` is 25.

**Decision:** clearing history empties Recently closed, at least through the API. Firefox's own "Clear history"
menu is verified by hand in `TESTING-CHECKLIST.md`.
