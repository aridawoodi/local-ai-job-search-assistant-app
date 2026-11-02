# Stack decision

**Locked:** Electron + TypeScript + Playwright (Chrome/Edge persistent profiles) + local Ollama.

Authoritative write-up lives in the project design docs. This repo mirrors the lock for contributors.

| Layer | Choice |
|-------|--------|
| App shell | Electron 33+ |
| Language | TypeScript |
| UI | React + Vite (`electron-vite`) |
| Browser automation | Playwright → system Chrome / Edge via `launchPersistentContext` |
| Local AI | Ollama HTTP (`127.0.0.1:11434`) |
| Storage | App `userData` JSON (profile, settings, tracker later) |
| Packaging | electron-builder: mac `x64` + `arm64` DMG, Windows NSIS x64 |

Tauri is deferred. Do not dual-track.
