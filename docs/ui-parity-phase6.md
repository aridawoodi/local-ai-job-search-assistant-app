# UI parity Phase 6 — polish

Closes the remaining extension → desktop familiarity leftovers from the UI parity plan.

## Shipped

| Item | Change |
|---|---|
| Icon pack | Extension brand PNGs synced to `build/icons/icon{16,32,48,128}.png` (+ `build/icon128.png`). `build/icon.png` (512) kept for electron-builder. |
| Window flash | `BrowserWindow.backgroundColor` `#0f1220` → Quiet Chrome `#f5f6fb`. Window title aligned to **AI Job Application Assistant**. |
| Report tab | Assistant nav → **Report**: diagnostics checklist + prefilled GitHub issue draft (no personal data). IPC `diag:info`. |
| Ollama resume re-read | Profile import review → **Read again with AI**. Merges model JSON with rules extract; only facts grounded in resume text; EEO never inferred / scrubbed. |

## Verify

```bash
npm run typecheck
npm run build
```

Extension `job-apply-assistant` / packaged v0.6.8: **read-only**, not modified.

## Intentional leftovers (out of UI parity)

- Saved resumes library (`#library`) — desktop keeps a single master resume
- In-page refine toolbar injection — deferred; app Resume refine panel preferred
