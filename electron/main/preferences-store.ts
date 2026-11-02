import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_PREFERENCES,
  type AppPreferences
} from '../../src/shared/preferences'

function storePath(): string {
  const dir = join(app.getPath('userData'), 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'preferences.json')
}

export function loadPreferences(): AppPreferences {
  try {
    const raw = readFileSync(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppPreferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      allowAutoSubmit: parsed.allowAutoSubmit === true,
      companyCareerUrls:
        parsed.companyCareerUrls ?? DEFAULT_PREFERENCES.companyCareerUrls,
      tailoringRules: parsed.tailoringRules ?? DEFAULT_PREFERENCES.tailoringRules,
      enabledSources: {
        ...DEFAULT_PREFERENCES.enabledSources,
        ...(parsed.enabledSources || {})
      }
    }
  } catch {
    return {
      ...DEFAULT_PREFERENCES,
      companyCareerUrls: [...DEFAULT_PREFERENCES.companyCareerUrls],
      tailoringRules: [...DEFAULT_PREFERENCES.tailoringRules],
      enabledSources: { ...DEFAULT_PREFERENCES.enabledSources }
    }
  }
}

export function savePreferences(prefs: AppPreferences): AppPreferences {
  writeFileSync(storePath(), JSON.stringify(prefs, null, 2), 'utf8')
  return prefs
}

export function updatePreferences(partial: Partial<AppPreferences>): AppPreferences {
  const current = loadPreferences()
  const next: AppPreferences = {
    ...current,
    ...partial,
    companyCareerUrls: partial.companyCareerUrls ?? current.companyCareerUrls,
    tailoringRules: partial.tailoringRules ?? current.tailoringRules,
    enabledSources: {
      ...current.enabledSources,
      ...(partial.enabledSources || {})
    }
  }
  // Confirm mode must never leave auto-submit effective as a surprise.
  if (next.applySafety === 'confirm') {
    // keep allowAutoSubmit flag stored but it is ignored at runtime
  }
  return savePreferences(next)
}
