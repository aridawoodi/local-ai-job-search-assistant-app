# UI parity Phase 3–5

Shipped on `main` via PRs #11 and #12.

## Phase 3 — Match + Apply

- Match cards: conic score ring, “Matches X of Y keywords”, missing/covered chips, dismiss, Improve my match → Resume, Fill this application.
- Apply: Fill top fits / Confirm & fill; field reports grouped **Needs you / Filled / Skipped**.

## Phase 4 — Resume panel

- Match summary for the selected job (ring + keywords).
- Tailor CTA labeled Improve my match; cover letter unchanged.
- Refine chips: Shorter / More technical / More enthusiastic / Polish / More specific.

## Phase 5 — Onboarding + practice

- Steps: Welcome → Import → Local AI → Ready (Enter the app sets `onboardingComplete`).
- Practice tour opens `fixtures/practice-apply-form.html` in the automation browser (fallback: default browser).

## Plan gaps closed

- Resume import **review UI** (`resume:import` preview → `resume:commit` with section checkboxes). Rules-only extract; EEO never applied.
- Settings: **Fields to fill** (`fieldToggles`, respected by Fill via `maskProfileForFill`), Writing style / Answer bank pointers, preferred resume format, remember-answers, practice button.

## Verify

```bash
npm run typecheck && npm run build
```

Screenshots: product store `media/ui-parity/phase3|phase4|phase5/`.
