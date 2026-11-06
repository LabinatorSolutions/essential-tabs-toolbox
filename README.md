# Essential Tabs Toolbox

A Firefox add-on by [Labinator](https://labinator.com/) for fast tab housekeeping, all from one toolbar popup:

- **Open a pasted list of links.** Paste any text: links wrapped in punctuation, bare domains (`example.com`) and
  blank lines are handled. Links already open are skipped. New tabs open in the background and load only when you
  click them, so pasting 50 links costs nothing up front.
- **List and copy your tabs**, filtered by **All**, **Pinned** or **Not pinned**.
- **By site:** every site with two or more tabs in the window gets one row with its own **Copy** button. Fifty
  YouTube tabs buried in a 100-tab window become one click. Single-tab sites are collected under **Other sites**.
- **Clean copies:** every copy removes known tracking parameters (`utm_*`, `fbclid`, `gclid` and similar) and keeps
  everything else in the link.
- **Sort A→Z** sorts the window's non-pinned tabs by URL. Tab groups stay where they are; the tabs inside each group
  are sorted among themselves.
- **Close duplicates** (off by default). When you open a page that is already open, the older copy closes and the
  tab in front of you stays. Pinned, playing, camera/microphone/screen-sharing and grouped tabs are never closed.
  YouTube videos match by video, whatever the timestamp or playlist.
- **Recently closed:** Firefox's own recently closed tabs list, one click away. Click a tab to bring it back with
  its history. Clearing Firefox's history clears this list too; the add-on keeps no list of its own.

## Requirements

- Firefox **159 or newer**, desktop. Older Firefox releases carry known, unpatched security vulnerabilities; the
  version floor is a deliberate security decision.

## Permissions

| Permission | Why |
|---|---|
| Access browser tabs (`tabs`) | List tabs and read their addresses and titles |
| Access recently closed tabs (`sessions`) | The Recently closed list, and telling restored tabs apart from new ones |
| `storage` | Remember the duplicate switch and the last filter |
| `cookies` | Open pasted links in the current tab's container. Without site access it cannot read any cookies |

No site access, no content scripts, no data collection. Nothing leaves your browser.

## Keyboard

| Key | Action |
|---|---|
| `Ctrl+Enter` in the paste box | Open the links |
| `Alt+1` … `Alt+4` | All, Pinned, Not pinned, By site |
| `Enter` on a tab row | Switch to that tab |

## Development

Requires [Bun](https://bun.sh/) and Firefox 159+.

```bash
bun install
bun run test     # Biome, rumdl, tsc --checkJs, unit tests, web-ext lint, real-Firefox tests
bun run build    # web-ext-artifacts/essential_tabs_toolbox-1.0.0.zip
```

The real-Firefox tests drive your installed Firefox headless over WebDriver BiDi (`tests/firefox/harness.js`).
Set `FIREFOX_PATH` to use another binary. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[AGPL-3.0-or-later](./LICENSE). © Labinator.
