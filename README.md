# Job Search Assistant (Desktop)

Native **Mac + Windows** desktop app: search → match → notify → apply by driving a **real browser** (Chrome / Edge) with **Playwright**, plus local **Ollama** for AI assists.

Runs alongside the [Job Apply Assistant](https://github.com/aridawoodi/job-apply-assistant) Chrome extension (read-only reference — this repo does **not** modify it).

## Stack (locked)

**Electron + TypeScript + Playwright (persistent Chrome/Edge profiles) + Ollama**

See [docs/stack-decision.md](docs/stack-decision.md).

| Target | Build |
|--------|--------|
| macOS Intel + Apple Silicon | `dmg` `x64` + `arm64` |
| Windows | `nsis` `x64` |

## Milestone 1 (this PR)

- Electron app shell (React UI, indigo→violet brand)
- Preferences: apply safety, browser choice, match threshold, max actions/day, Ollama URL
- Profile import: `job-apply-profile.json`, `kind: job-apply-assistant-backup`, sample fixture
- Local JSON store for preferences + profile bundle
- Ollama reachability indicator
- Placeholder modules for search / match / notify / apply / BrowserController

**Not in M1:** live Playwright sessions, search, notify/apply automation.

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

### Import a profile

1. First launch → **Import extension profile** (or **Load sample profile** / **Skip**).
2. Or Preferences → Import from file.
3. Accepts extension Settings export (`job-apply-profile.json`) and full backups (`kind: job-apply-assistant-backup`).
4. Fixtures for local testing: `fixtures/sample-profile.json`, `fixtures/sample-backup.json`.

Prefs and profile survive restart under Electron `userData`.

## Layout

```
electron/main/     Main process: IPC, prefs/profile stores, Ollama probe, BrowserController stub
electron/preload/  contextBridge API
src/renderer/      React UI (onboarding, profile, preferences, pipeline)
src/shared/        Types, prefs, profile schema, IPC contract
src/modules/       search | match | notify | apply | import
fixtures/          Sample import JSON
docs/              Stack decision mirror
```

## Privacy

Local-first. No job-board APIs. User logs into sites manually in the automation browser; the app never stores job-board passwords.
