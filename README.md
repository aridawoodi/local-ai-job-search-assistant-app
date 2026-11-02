# Job Search Assistant (Desktop)

Native **Mac + Windows** desktop app: search → match → notify → apply by driving a **real browser** (Chrome / Edge) with **Playwright**, plus local **Ollama** for AI assists.

Runs alongside the [Job Apply Assistant](https://github.com/aridawoodi/job-apply-assistant) Chrome extension (read-only reference — this repo does **not** modify it).

## Stack (locked)

**Electron + TypeScript + Playwright (persistent Chrome/Edge profiles) + Ollama**

See [docs/stack-decision.md](docs/stack-decision.md).

| Target | Build |
|--------|--------|
| macOS Intel + Apple Silicon | `dmg` + `zip` **universal** |
| Windows | `nsis` `x64` |

## Current slice (post-M3)

- **Match inbox / Apply queue / Tracker** tabs (extension-style workflow surfaces)
- **Tracker**: stages (`saved`→`offer`), notes, reminders + desktop reminder notify, CSV export; fill results write rows via extension-compatible `jobKey`
- **LinkedIn search hardening**: richer selectors, scroll-load, guest path before fixture; still needs login for best results
- **Company career crawl**: Greenhouse / Lever / Ashby-aware scrapers + generic fallback
- **Scheduled search** pref (minutes; 0 = off) while the app is open
- Multi-source search + apply-fill from Milestone 3 (confirm / unattended; never auto-submits)

### Chrome ↔ Edge profiles

Switching the browser preference uses a **different profile folder** (`pw-chrome-profile` vs `pw-edge-profile` vs `pw-auto-profile` for “either”). Sessions are **not** shared across browsers — log in again after switching.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm run build
npm run dist:mac
npm run dist:win
```

### Demo flow

1. First launch → import sample/extension profile (or skip).
2. Preferences → enable sources; set query/location; optional company career URLs / schedule.
3. Pipeline → **Open browser** → log into LinkedIn (and others) manually if needed.
4. **Check sessions** → **Run search → match → notify**.
5. **Matches** / **Apply** tabs → queue + confirm fill (Submit stays manual).
6. **Tracker** → stages, notes, reminders, CSV export.

### Import a profile

1. First launch → **Import extension profile** (or **Load sample profile** / **Skip**).
2. Or Preferences → Import from file.
3. Accepts extension Settings export (`job-apply-profile.json`) and full backups (`kind: job-apply-assistant-backup`) including `applications`.
4. Fixtures: `fixtures/sample-profile.json`, `fixtures/sample-backup.json`, `fixtures/*-results.html`, `fixtures/practice-apply-form.html`.

Prefs and profile survive restart under Electron `userData`. Automation cookies live under `userData/browser-profiles/`.

## Layout

```
electron/main/     IPC, prefs/profile stores, Ollama, BrowserController, schedule/reminders
electron/preload/  contextBridge API
src/renderer/      React UI (Pipeline, Matches, Apply, Tracker, Profile, Prefs)
src/shared/        Types, prefs, profile schema, tracker schema, IPC contract
src/modules/       search | match | notify | apply/fill | tracker | import
fixtures/          Sample profile + source result HTML + practice apply form
docs/              Stack decision mirror
```

## Privacy

Local-first. No job-board APIs. User logs into sites manually in the automation browser; the app never stores job-board passwords.
