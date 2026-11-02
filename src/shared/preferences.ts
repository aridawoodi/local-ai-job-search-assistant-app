/**
 * User-controlled preferences. Defaults are sensible; nothing is hard-locked.
 */

export type ApplySafetyMode = 'confirm' | 'unattended'
export type BrowserPreference = 'chrome' | 'edge' | 'either'

export interface AppPreferences {
  applySafety: ApplySafetyMode
  browser: BrowserPreference
  /** First-run: prompt until imported or skipped. */
  extensionImportStatus: 'not_started' | 'imported' | 'skipped'
  onboardingComplete: boolean
  maxActionsPerDay: number
  matchThreshold: number
  ollamaUrl: string
  enabledSources: {
    google: boolean
    linkedin: boolean
    indeed: boolean
    companySites: boolean
  }
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  applySafety: 'confirm',
  browser: 'either',
  extensionImportStatus: 'not_started',
  onboardingComplete: false,
  maxActionsPerDay: 25,
  matchThreshold: 70,
  ollamaUrl: 'http://127.0.0.1:11434',
  enabledSources: {
    google: true,
    linkedin: true,
    indeed: true,
    companySites: true
  }
}
