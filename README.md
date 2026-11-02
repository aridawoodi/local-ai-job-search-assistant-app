# Job Search Assistant (Desktop)

Native **Mac + Windows** desktop app: search → match → notify → apply by driving a **real browser** (Chrome / Edge) with **Playwright**, plus local **Ollama** for AI assists.

Runs alongside the [Job Apply Assistant](https://github.com/aridawoodi/job-apply-assistant) Chrome extension (read-only reference — this repo does **not** modify it).

## Stack (locked)

**Electron + TypeScript + Playwright (persistent Chrome/Edge profiles) + Ollama**

See [docs/stack-decision.md](docs/stack-decision.md) · packaging detail [docs/packaging.md](docs/packaging.md).

| Target | Build |
|--------|--------|
| macOS Intel + Apple Silicon | `dmg` + `zip` **universal** |
| Windows | `nsis` + `zip` `x64` |

## Current slice

- **Packaging:** `npm run dist` / `dist:mac` / `dist:win` via `scripts/package.mjs` → artifacts in `release/`
- **AI tab:** Ollama tailor / cover letter / refine with fact checks
- **Resume import:** local PDF/DOCX → profile fields + `resumeText` (EEO never inferred)
- **Answer bank:** similarity merge ≥85% + never-learn filters
- **Apply submit gate:** confirm mode never submits; unattended submits only when `allowAutoSubmit` is on
- Match inbox / Apply queue / Tracker; multi-source search; schedule + reminders

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
npm run dist:mac    # universal dmg + zip → release/
npm run dist:win    # nsis + zip (prefer Windows host for NSIS)
npm run dist:dir    # unpackaged dir smoke
```

## First run (Mac / Windows)

1. **Install deps & launch**
   ```bash
   npm install
   npm run dev
   ```
2. **Onboarding** — choose one:
   - **Import extension profile** — `job-apply-profile.json` or a full backup (`kind: job-apply-assistant-backup`).
   - **Load sample profile** — `fixtures/sample-profile.json` (Jordan Rivera) for a safe walkthrough.
   - **Skip for now** — continue empty; import later under Preferences / Profile.
3. **Defaults stay safe** — apply safety = confirm; auto-submit off. Confirm mode never presses Submit.
4. **Ollama pill** — top bar shows `Ollama up/down`. Start [Ollama](https://ollama.com) locally for the AI tab (`qwen2.5` or any pulled model).
5. **Pipeline checklist**
   - **Open browser** — launches Chrome/Edge with a dedicated Playwright profile under Electron `userData` (not your daily browser profile).
   - Log into LinkedIn / Indeed **manually** in that window if you need live results.
   - **Check sessions** — login/captcha walls pause the pipeline with a Resume banner (no password storage).
   - **Run search → match → notify** — live scrape when possible; boards that block fall back to fixtures and say so in the status log.
6. **Empty tabs guide you** — Matches / Apply / Tracker / Profile show first-run steps until data exists.
7. **Permissions / tooling notes**
   - System **Chrome** or **Edge** must be installed (Playwright drives the installed browser channel — no bundled Chromium required for normal use).
   - macOS may prompt for **Automation** / screen recording only if you grant tools that need them; the app itself uses its own browser window.
   - Signing / notarization is **not** required for `npm run dev`; see [docs/packaging.md](docs/packaging.md) for release builds.

Prefs and profile survive restart under Electron `userData` (`~/Library/Application Support/local-ai-job-search-assistant-app` on Mac). Automation cookies live under `userData/browser-profiles/`.

### Demo flow (after onboarding)

1. Profile → **Import resume (PDF/DOCX)** if needed; manage answer bank.
2. Preferences → sources, query, schedule; apply safety + optional auto-submit (unattended only).
3. Pipeline → **Open browser** → log in → **Run search → match → notify**.
4. **AI** tab → tailor / cover / refine against a matched job (Ollama running locally).
5. **Apply** → queue + confirm fill; submit only if unattended + allowAutoSubmit.
6. **Tracker** → stages, notes, reminders, CSV.

### Import a profile

1. First launch → **Import extension profile** (or **Load sample profile** / **Skip**).
2. Or Preferences → Import from file / Load sample.
3. Accepts extension Settings export (`job-apply-profile.json`) and full backups (`kind: job-apply-assistant-backup`) including `applications`.
4. Fixtures: `fixtures/sample-profile.json`, `fixtures/sample-backup.json`, `fixtures/*-results.html`, `fixtures/practice-apply-form.html`.

## Layout

```
electron/main/     IPC, prefs/profile stores, Ollama, BrowserController, schedule/reminders
electron/preload/  contextBridge API
src/renderer/      React UI (Pipeline, Matches, Apply, AI, Tracker, Profile, Prefs)
src/shared/        Types, prefs, profile schema, tracker + answer-bank, IPC contract
src/modules/       search | match | notify | apply | ai | resume | tracker | import
scripts/           package.mjs (typecheck → build → electron-builder)
build/             Icon for installers
fixtures/          Sample profile + source result HTML + practice apply form
docs/              Stack + packaging
```

## Privacy

Local-first. No job-board APIs. User logs into sites manually in the automation browser; the app never stores job-board passwords.
