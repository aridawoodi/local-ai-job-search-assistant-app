# UI parity Phase 2 — Profile + Settings + resume mapping

## Scope

Full Profile editor parity with extension Options → Profile, options-like Settings sections, and resume PDF/DOCX mapping aligned with extension `applyToProfile`.

## Profile editor

Sections (sticky in-page nav): Contact, Location, Links, Work auth, Experience (add/edit/remove/reorder), Education (add/edit/remove/reorder + highest), Projects (add/edit/remove), Skills / certs / languages, EEO (user-set only), Availability, Writing style, Resume text, Answer bank.

Save via `profile:save` IPC → `prepareProfileForSave` (normalize jobs, sync education mirror + current* mirrors).

## Settings

Anchored sections matching extension mental model: Behaviour, Browser, Sources, Local AI, Tailoring, Backups, Import/export, Tracker, Schedule. Profile remains its own tab.

## Resume import mapping

Deterministic rules port (`src/modules/resume/extract.ts` + `applyResumePatch`):

| Maps | Does not map |
|---|---|
| name, email, phone, links, location, summary | **all `eeo.*`** |
| workHistory → syncCurrent mirrors | work auth / sponsorship / over18 |
| education → educationList + syncEducation | salary / availability / notice / relocate |
| projects, skills, certifications, languages | invented facts (must appear in text) |
| yearsExperience, resumeText (≤20k), signature if empty | |

## Intentional gaps

1. No interactive importer review UI with per-list replace checkboxes — desktop auto-applies lists when the patch has items (same as choosing all fields in the extension importer).
2. No Ollama-assisted section extract in this PR — rules-only path (extension AI-off behaviour). Optional AI re-read can land later.
3. Chrome-only Options surfaces omitted or remapped: Sites allowlist → Sources toggles; Fields-to-fill toggles / floating Fill / badge not on desktop Settings yet.
4. Master resume `dataUrl` blob not stored; import keeps parsed metadata (`name`, `kind`, `importedAt`).
5. Writing style + answer bank live on Profile (extension puts `#style` / `#bank` on Options); Settings points users to Profile for those.

## Verify

```bash
npm run typecheck && npm run build
```

Screenshots: product store `media/ui-parity/phase2/`.
