# Contributing

## Layout

```text
manifest.json            MV3 manifest (Firefox 159+, desktop)
icon.svg                 Labinator icon system: ultramarine plate, flat white glyph
src/lib/rules.js         every decision, DOM-free and unit-tested
src/lib/settings.js      storage defaults
src/background.js        auto-close duplicates
src/popup/               the toolbar popup (popup.js) and its browser calls (actions.js)
tests/unit/              bun test
tests/firefox/           real-Firefox tests over WebDriver BiDi
docs/superpowers/        design spec, implementation plan, platform probe results
```

## Rules of the codebase

- Plain JavaScript ES modules, no build step: AMO reviews exactly what is in the repo.
- `src/lib/rules.js` never touches `browser` or the DOM. Put every decision there and test it.
- `browser.*` calls live in `src/background.js`, `src/popup/*.js` and `src/lib/settings.js` only.
- Firefox behavior that the docs don't pin down is measured, not assumed. `docs/superpowers/notes/` records what
  the probes found, for example how `tabs.move` decides group membership.

## Gates

`bun run test` must pass before a commit:

1. `biome check .` (JavaScript, JSON, CSS; Markdown excluded)
2. `rumdl check .` (Markdown)
3. `tsc --noEmit` (type-checks `src/` with `checkJs`)
4. `bun test tests/unit`
5. `web-ext lint`
6. `bun test tests/firefox` (headless Firefox; about a minute)

The Firefox tests set `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` for their throwaway headless browser so BiDi can script
the add-on's own pages. Never set it for a browser you use.

## Releasing

1. Bump `version` in `manifest.json` and `package.json`.
2. Add a `CHANGELOG.md` entry.
3. Work through `TESTING-CHECKLIST.md`.
4. `bun run build`, then upload `web-ext-artifacts/essential_tabs_toolbox-<version>.zip` to AMO. Tick **Firefox
   only**, not Firefox for Android.
5. Raise `strict_min_version` only in a release of its own, never together with a bug fix: users below the new
   floor stop receiving updates.
