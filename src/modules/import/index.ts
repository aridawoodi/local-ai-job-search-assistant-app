import {
  DEFAULT_EXTENSION_SETTINGS,
  EMPTY_PROFILE,
  type AnswerBankEntry,
  type ExtensionSettings,
  type StoredProfileBundle,
  type UserProfile
} from '../../shared/profile'
import { parseApplications } from '../tracker'

export interface ImportResult {
  ok: boolean
  message: string
  format?: 'job-apply-profile' | 'job-apply-assistant-backup' | 'sample-profile' | 'raw-profile'
  bundle?: StoredProfileBundle
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function mergeProfile(raw: unknown): UserProfile {
  const base: UserProfile = {
    ...EMPTY_PROFILE,
    education: { ...EMPTY_PROFILE.education },
    eeo: { ...EMPTY_PROFILE.eeo },
    workHistory: [],
    educationList: [],
    projects: [],
    skills: [],
    certifications: [],
    languages: []
  }
  if (!isRecord(raw)) return base

  const education = isRecord(raw.education)
    ? { ...base.education, ...raw.education }
    : base.education
  const eeo = isRecord(raw.eeo) ? { ...base.eeo, ...raw.eeo } : base.eeo

  return {
    ...base,
    ...(raw as Partial<UserProfile>),
    education,
    eeo,
    workHistory: Array.isArray(raw.workHistory) ? (raw.workHistory as UserProfile['workHistory']) : [],
    educationList: Array.isArray(raw.educationList)
      ? (raw.educationList as UserProfile['educationList'])
      : [],
    projects: Array.isArray(raw.projects) ? (raw.projects as UserProfile['projects']) : [],
    skills: Array.isArray(raw.skills) ? raw.skills.map(String) : [],
    certifications: Array.isArray(raw.certifications) ? raw.certifications.map(String) : [],
    languages: Array.isArray(raw.languages) ? raw.languages.map(String) : []
  }
}

function parseAnswerBank(raw: unknown): AnswerBankEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .map((e) => ({
      q: String(e.q ?? ''),
      a: String(e.a ?? ''),
      source: e.source != null ? String(e.source) : undefined,
      companySpecific: Boolean(e.companySpecific)
    }))
    .filter((e) => e.q || e.a)
}

function parseSettings(raw: unknown): ExtensionSettings {
  if (!isRecord(raw)) return { ...DEFAULT_EXTENSION_SETTINGS }
  return { ...DEFAULT_EXTENSION_SETTINGS, ...raw }
}

function displayLabel(profile: UserProfile): string {
  return (
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    profile.email ||
    'profile'
  )
}

/**
 * Accepts:
 * - job-apply-profile.json export ({ exportedAt?, profile, answerBank?, settings?, resume? })
 * - kind: job-apply-assistant-backup full backup
 * - sample-profile.json shape ({ profile, answerBank?, settings? })
 * - bare profile object (heuristic: has firstName/email/skills)
 */
export function parseExtensionExport(
  jsonText: string,
  sourceLabel = 'file'
): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    return { ok: false, message: 'File is not valid JSON.' }
  }

  if (!isRecord(data)) {
    return { ok: false, message: 'JSON root must be an object.' }
  }

  if (data.kind === 'job-apply-assistant-backup') {
    if (!isRecord(data.profile)) {
      return { ok: false, message: 'Backup is missing a profile object.' }
    }
    const bundle: StoredProfileBundle = {
      profile: mergeProfile(data.profile),
      answerBank: parseAnswerBank(data.answerBank),
      settings: parseSettings(data.settings),
      applications: parseApplications(
        Array.isArray(data.applications) ? data.applications : []
      ),
      resume: data.resume,
      importedFrom: sourceLabel,
      importedAt: new Date().toISOString()
    }
    const warn =
      data.resume == null
        ? ' (no resume blob in backup — OK for rolling snapshots).'
        : ''
    return {
      ok: true,
      format: 'job-apply-assistant-backup',
      message: `Imported extension backup for ${displayLabel(bundle.profile)}.${warn}`,
      bundle
    }
  }

  if (isRecord(data.profile)) {
    const bundle: StoredProfileBundle = {
      profile: mergeProfile(data.profile),
      answerBank: parseAnswerBank(data.answerBank),
      settings: parseSettings(data.settings),
      applications: parseApplications(
        Array.isArray(data.applications) ? data.applications : []
      ),
      resume: data.resume,
      importedFrom: sourceLabel,
      importedAt: new Date().toISOString()
    }
    const format: ImportResult['format'] =
      data.exportedAt != null ? 'job-apply-profile' : 'sample-profile'
    return {
      ok: true,
      format,
      message: `Imported ${
        format === 'job-apply-profile' ? 'profile export' : 'profile'
      } for ${displayLabel(bundle.profile)}.`,
      bundle
    }
  }

  const looksLikeBareProfile =
    typeof data.firstName === 'string' ||
    typeof data.email === 'string' ||
    Array.isArray(data.skills)

  if (looksLikeBareProfile) {
    const bundle: StoredProfileBundle = {
      profile: mergeProfile(data),
      answerBank: [],
      settings: { ...DEFAULT_EXTENSION_SETTINGS },
      applications: [],
      importedFrom: sourceLabel,
      importedAt: new Date().toISOString()
    }
    return {
      ok: true,
      format: 'raw-profile',
      message: `Imported bare profile for ${displayLabel(bundle.profile)}.`,
      bundle
    }
  }

  return {
    ok: false,
    message:
      'Unrecognized format. Expected job-apply-profile.json, kind: job-apply-assistant-backup, or sample-profile shape.'
  }
}

export async function importExtensionProfileFromText(
  jsonText: string,
  sourceLabel?: string
): Promise<ImportResult> {
  return parseExtensionExport(jsonText, sourceLabel)
}

export function skipExtensionImportMessage(): string {
  return 'Extension import skipped. You can import a profile later from Preferences.'
}

export {
  buildProfileExport,
  buildFullBackup,
  serializeExport
} from './export'
export type { ProfileExportDoc, FullBackupDoc } from './export'
