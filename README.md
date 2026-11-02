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

## Milestone 3 (this branch)

- **Multi-source search** (no job-board APIs):
  - **Indeed** — live result cards (fixture fallback)
  - **Google Jobs** — public `udm=8` scrape (fixture fallback)
  - **LinkedIn** — job search UI when logged in (fixture fallback)
  - **Company career sites** — user-configured listing URLs + generic scrape stub
- Source enable toggles, soft rate limit between sources, in-app **search history**
- **Apply-fill** ported from extension patterns (Greenhouse / Lever / Ashby / LinkedIn Easy Apply / generic):
  - **Confirm** (default): queue → user Confirm → autofill
  - **Unattended**: autofill without per-job click
  - **Never auto-submits** (no Submit / Apply / Next clicks); practice form at `fixtures/practice-apply-form.html`

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
2. Preferences → enable sources; set query/location; optional company career URLs.
3. Pipeline → **Open browser** → log into LinkedIn (and others) manually if needed.
4. **Check sessions** → **Run search → match → notify**.
5. **Apply / fill** → in confirm mode, **Confirm apply** to autofill (Submit stays manual).

### Import a profile

1. First launch → **Import extension profile** (or **Load sample profile** / **Skip**).
2. Or Preferences → Import from file.
3. Accepts extension Settings export (`job-apply-profile.json`) and full backups (`kind: job-apply-assistant-backup`).
4. Fixtures: `fixtures/sample-profile.json`, `fixtures/sample-backup.json`, `fixtures/*-results.html`, `fixtures/practice-apply-form.html`.

Prefs and profile survive restart under Electron `userData`. Automation cookies live under `userData/browser-profiles/`.

## Layout

```
electron/main/     IPC, prefs/profile stores, Ollama, BrowserController
electron/preload/  contextBridge API
src/renderer/      React UI
src/shared/        Types, prefs, profile schema, IPC contract
src/modules/       search (Indeed/Google/LinkedIn/company) | match | notify | apply/fill | import
fixtures/          Sample profile + source result HTML + practice apply form
docs/              Stack decision mirror
```

## Privacy

Local-first. No job-board APIs. User logs into sites manually in the automation browser; the app never stores job-board passwords.
