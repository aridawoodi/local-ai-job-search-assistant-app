# Packaging (Mac universal + Windows)

Installers and portable archives are produced with **electron-builder** after `electron-vite` compiles main/preload/renderer into `out/`.

## Scripts

| Command | What it builds |
|---------|----------------|
| `npm run dist` | Mac **universal** `dmg` + `zip` **and** Windows `nsis` + `zip` (`x64`) |
| `npm run dist:mac` | Mac universal only |
| `npm run dist:win` | Windows nsis + zip only |
| `npm run dist:dir` | Unpackaged app directories (fast local smoke; no installer) |
| `npm run package` | Same as `dist` via `scripts/package.mjs` (typecheck → build → electron-builder, lists `release/`) |

Artifacts: **`release/`** (gitignored).

## Platforms

- **macOS Intel + Apple Silicon:** `mac.target` uses `arch: ["universal"]` for both `dmg` and `zip`. Code signing / notarization are optional — local builds set `CSC_IDENTITY_AUTO_DISCOVERY=false` in the package script so unsigned CI/dev machines still produce binaries. For notarized releases, set Apple signing identity + notarize env vars before `dist:mac`.
- **Windows x64:** `nsis` installer (choose install dir, not one-click) + `zip` portable. Building NSIS **on macOS** may require Wine; prefer running `npm run dist:win` on a Windows machine (or GitHub Actions `windows-latest`). The `zip` target is the reliable cross-compile fallback.

## Icons & branding

- `build/icon.png` (512², indigo→violet mark) is the electron-builder source for Mac `.icns` and Windows `.ico`.
- In-app brand mark matches extension indigo `#4f46e5` → violet `#7c3aed` with emerald accents.
- Product name: **Job Search Assistant** (`appId: com.aridawoodi.job.search.assistant`).

## Smoke checklist

1. `npm run typecheck && npm run build`
2. `npm run dist:mac` (on Mac) → confirm `release/*.dmg` and `release/*-mac.zip` (or universal named variants)
3. On Windows (or CI): `npm run dist:win` → confirm `release/*.exe` and/or `*.zip`
4. Launch the packaged app once; Preferences → Check Ollama; Pipeline still loads
5. Preferences → Export full backup → re-import the same file (round-trip)

## Notes

- Playwright browsers are **not** bundled inside the installer; the app drives the user’s installed Chrome/Edge with a persistent profile under Electron `userData`.
- Practice fixtures ship under `extraResources/fixtures` (Greenhouse-like, Workday basic, Easy Apply multi-step, generic wizard).
- Do not commit `release/` outputs.
