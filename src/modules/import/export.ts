/**
 * Extension-compatible profile + full backup exporters (round-trip with importers).
 */
import type { StoredProfileBundle } from '../../shared/profile'

export interface ProfileExportDoc {
  exportedAt: string
  profile: StoredProfileBundle['profile']
  answerBank: StoredProfileBundle['answerBank']
  settings: StoredProfileBundle['settings']
  resume?: unknown
}

export interface FullBackupDoc {
  kind: 'job-apply-assistant-backup'
  version: number
  exportedAt: string
  profile: StoredProfileBundle['profile']
  answerBank: StoredProfileBundle['answerBank']
  applications: StoredProfileBundle['applications']
  settings: StoredProfileBundle['settings']
  resume?: unknown
}

/** Settings → Import/export profile shape (`job-apply-profile.json`). */
export function buildProfileExport(
  bundle: StoredProfileBundle,
  opts?: { includeResume?: boolean }
): ProfileExportDoc {
  const doc: ProfileExportDoc = {
    exportedAt: new Date().toISOString(),
    profile: bundle.profile,
    answerBank: bundle.answerBank || [],
    settings: bundle.settings || {}
  }
  if (opts?.includeResume !== false && bundle.resume != null) {
    doc.resume = bundle.resume
  }
  return doc
}

/** Full backup with `kind: job-apply-assistant-backup` for round-trip import. */
export function buildFullBackup(
  bundle: StoredProfileBundle,
  opts?: { includeResume?: boolean; version?: number }
): FullBackupDoc {
  const doc: FullBackupDoc = {
    kind: 'job-apply-assistant-backup',
    version: opts?.version ?? 1,
    exportedAt: new Date().toISOString(),
    profile: bundle.profile,
    answerBank: bundle.answerBank || [],
    applications: bundle.applications || [],
    settings: bundle.settings || {}
  }
  if (opts?.includeResume !== false && bundle.resume != null) {
    doc.resume = bundle.resume
  }
  return doc
}

export function serializeExport(doc: ProfileExportDoc | FullBackupDoc): string {
  return JSON.stringify(doc, null, 2)
}
