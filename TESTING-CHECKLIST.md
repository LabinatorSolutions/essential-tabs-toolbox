# Testing Checklist

`bun run test` covers the rules, the sort, auto-close, the popup, the paste box and Recently closed in a real
headless Firefox. This checklist covers what automation cannot reach. Install the build from `about:debugging` →
This Firefox → Load Temporary Add-on.

## Before each release

- [ ] `bun run test` passes.
- [ ] `bun run build`; `unzip -l` lists only `manifest.json`, `icon.svg`, `LICENSE` and `src/**`.

## Auto-close duplicates (turn the switch on first)

- [ ] **Browser restart.** With session restore on (Settings → General → Open previous windows and tabs) and
      several duplicate pairs open, restart Firefox. No restored tab closes.
- [ ] Open a page you already have open: the older copy closes, the new tab stays in front, and the toolbar badge
      shows `1` for a few seconds.
- [ ] An older copy that is **pinned**, **playing audio**, **sharing the camera/microphone/screen**, or **inside a
      tab group** stays open.
- [ ] A copy in another **container** and a copy in a **private window** stay open.
- [ ] Clicking a link inside a tab, to a page open elsewhere, closes nothing.
- [ ] `Ctrl+Shift+T` (Reopen Closed Tab) on a page that is open again closes nothing.

## Popup

- [ ] **Copy** puts the right URLs on the real clipboard, with tracking parameters removed.
- [ ] **Sort A→Z** with real tab groups (including a collapsed group): groups stay in place, tabs inside are
      sorted, pinned tabs don't move.
- [ ] Keyboard only: `Tab` reaches every control with a visible ultramarine focus ring; `Alt+1`–`Alt+4` switch
      filters; `Enter` on a row switches tabs; `Ctrl+Enter` opens pasted links.
- [ ] Pasting into a container tab opens the links in that container.

## Recently closed

- [ ] Closed tabs appear newest first; clicking one restores it with its back history.
- [ ] After Firefox's own **History → Clear recent history** (Browsing history checked), the list is empty. The API
      equivalent was measured empty in probe P4.

## Look

- [ ] The 16 px toolbar icon is legible on a light and a dark Firefox theme.
- [ ] The popup has no horizontal scroll at 1920×1080 and at 125%/150% display scaling.
