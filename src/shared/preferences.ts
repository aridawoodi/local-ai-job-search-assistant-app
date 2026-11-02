/**
 * User-controlled preferences. Defaults are sensible; nothing is hard-locked.
 */

export type ApplySafetyMode = 'confirm' | 'unattended'
export type BrowserPreference = 'chrome' | 'edge' | 'either'

export interface AppPreferences {
  applySafety: ApplySafetyMode
  /**
   * When true AND applySafety === 'unattended', the apply pipeline may click a final
   * Submit/Apply control after fill. Confirm mode always ignores this (never auto-submits).
   */
  allowAutoSubmit: boolean
  /**
   * When true, after fill the apply pipeline may click Next/Continue and re-fill
   * subsequent steps (multi-step + Easy Apply wizards). Confirm mode may advance
   * steps but still never auto-submits.
   */
  allowAdvanceSteps: boolean
  /** Soft cap on Next/Continue advances per application (multi-step sessions). */
  maxFormSteps: number
  /**
   * When scheduled search runs and applySafety is unattended, also queue best-fit
   * jobs into the apply pipeline (still respects allowAutoSubmit / caps).
   */
  scheduledIncludeApply: boolean
  browser: BrowserPreference
  /** First-run: prompt until imported or skipped. */
  extensionImportStatus: 'not_started' | 'imported' | 'skipped'
  onboardingComplete: boolean
  maxActionsPerDay: number
  matchThreshold: number
  ollamaUrl: string
  /** Preferred Ollama model; empty → first available tag. */
  ollamaModel: string
  /** Search query; empty → derive from profile title/skills. */
  searchQuery: string
  /** Search location; empty → derive from profile or Remote. */
  searchLocation: string
  /**
   * User-configured company career listing URLs (one per line in UI).
   * Scraped with a generic job-card heuristic when companySites is enabled.
   */
  companyCareerUrls: string[]
  /** Soft delay between enabled sources (ms). */
  sourceRateLimitMs: number
  enabledSources: {
    google: boolean
    linkedin: boolean
    indeed: boolean
    companySites: boolean
  }
  /** Minutes between scheduled searches; 0 = off (manual only). */
  scheduledSearchMinutes: number
  /** Notify when tracker reminder dates are due. */
  reminderNotifications: boolean
  /** Optional user rules for resume tailoring. */
  tailoringRules: string[]
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  applySafety: 'confirm',
  allowAutoSubmit: false,
  allowAdvanceSteps: true,
  maxFormSteps: 6,
  scheduledIncludeApply: false,
  browser: 'either',
  extensionImportStatus: 'not_started',
  onboardingComplete: false,
  maxActionsPerDay: 25,
  matchThreshold: 70,
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  searchQuery: '',
  searchLocation: '',
  companyCareerUrls: [
    'https://boards.greenhouse.io/stripe',
    'https://jobs.lever.co/netflix'
  ],
  sourceRateLimitMs: 1500,
  enabledSources: {
    // M3: Indeed + Google Jobs on by default; LinkedIn + company stubs opt-in.
    google: true,
    linkedin: false,
    indeed: true,
    companySites: false
  },
  scheduledSearchMinutes: 0,
  reminderNotifications: true,
  tailoringRules: []
}
