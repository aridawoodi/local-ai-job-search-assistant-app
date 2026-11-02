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

## Milestone 2 (this PR)

- Playwright **BrowserController**: launch Chrome or Edge with a **dedicated persistent profile** under Electron `userData`
- **Open browser** / **Check sessions** UI (Indeed + LinkedIn probes; user logs in manually)
- **First search source: Indeed** (live result-card scrape — no job-board API). LinkedIn/Google Jobs come later
- Parse cards into the in-app job list; **match** via ported extension `lib/match.js` against imported profile
- **Desktop notifications** for best fits (session dedupe)
- Apply safety respected: **no auto-submit** in M2 (confirm queues only; unattended skipped)

If Indeed shows a captcha or returns no cards, the run can fall back to `fixtures/indeed-results.html` so demos still work — complete the captcha in the automation window and re-run for live data.

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
2. Preferences → set Indeed query/location (optional; otherwise derived from profile).
3. Pipeline → **Open browser** → log into Indeed/LinkedIn manually if you want.
4. **Check sessions** → **Run search → match → notify**.
5. Approve OS notification permission when prompted.

### Import a profile

1. First launch → **Import extension profile** (or **Load sample profile** / **Skip**).
2. Or Preferences → Import from file.
3. Accepts extension Settings export (`job-apply-profile.json`) and full backups (`kind: job-apply-assistant-backup`).
4. Fixtures: `fixtures/sample-profile.json`, `fixtures/sample-backup.json`, `fixtures/indeed-results.html`.

Prefs and profile survive restart under Electron `userData`. Automation cookies live under `userData/browser-profiles/`.

## Layout

```
electron/main/     IPC, prefs/profile stores, Ollama, BrowserController
electron/preload/  contextBridge API
src/renderer/      React UI
src/shared/        Types, prefs, profile schema, IPC contract
src/modules/       search (Indeed) | match | notify | apply | import
fixtures/          Sample profile + Indeed results HTML
docs/              Stack decision mirror
```

## Privacy

Local-first. No job-board APIs. User logs into sites manually in the automation browser; the app never stores job-board passwords.
