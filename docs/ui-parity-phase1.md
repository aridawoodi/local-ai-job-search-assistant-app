# UI parity Phase 1 — shell + tokens

Aligns the Electron renderer with Job Apply Assistant extension **Quiet Chrome** look and IA.

## Changes

- Port CSS tokens from extension `lib/pages.css` (`--brand`, `--brand2`, `--ink`, `--muted`, `--line`, `--bg #f5f6fb`, system fonts).
- Light theme (was dark).
- 3px brand accent bar.
- Options-like left sidebar grouped as **Automation** / **Assistant** / **Setup**.
- Labels: Pipeline, Matches, Apply, **Resume** (was AI), Tracker, Profile, **Settings** (was Preferences), **Advanced** (was Modules).
- Product title: **AI Job Application Assistant** · Desktop.

Desktop-only Pipeline / Apply queue / Advanced stay; labeled so they don’t redefine the extension mental model.

Full plan lives in the product store: `docs/extension-ui-parity-plan.md`.
