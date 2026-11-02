import type { AppPreferences } from './preferences'
import type { StoredProfileBundle } from './profile'
import type { OllamaStatus } from './ollama'
import type { ApplyResult, JobListing, MatchResult, PipelineStatus } from './types'

export type { OllamaStatus }

export interface ImportUiResult {
  ok: boolean
  message: string
  format?: string
  cancelled?: boolean
}

export interface DesktopApi {
  getPreferences: () => Promise<AppPreferences>
  setPreferences: (partial: Partial<AppPreferences>) => Promise<AppPreferences>
  getProfile: () => Promise<StoredProfileBundle>
  getPipelineStatus: () => Promise<PipelineStatus>
  runSearch: () => Promise<JobListing[]>
  runMatch: (jobs: JobListing[]) => Promise<MatchResult[]>
  notifyBestFits: (matches: MatchResult[]) => Promise<{ notified: number }>
  runApply: (jobIds: string[]) => Promise<ApplyResult[]>
  importExtensionProfile: () => Promise<ImportUiResult>
  importSampleProfile: () => Promise<ImportUiResult>
  skipExtensionImport: () => Promise<AppPreferences>
  checkOllama: () => Promise<OllamaStatus>
  completeOnboarding: () => Promise<AppPreferences>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
