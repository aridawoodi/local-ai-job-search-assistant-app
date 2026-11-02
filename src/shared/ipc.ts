import type { AppPreferences } from './preferences'
import type { StoredProfileBundle } from './profile'
import type { OllamaStatus } from './ollama'
import type { ApplicationRow, TrackerStage, TrackerStatus } from './tracker'
import type {
  ApplyResult,
  BrowserRuntimeStatus,
  JobListing,
  MatchResult,
  PipelineStatus,
  SearchHistoryEntry,
  SearchMeta,
  SessionCheckResult
} from './types'

export type { OllamaStatus }

export interface ImportUiResult {
  ok: boolean
  message: string
  format?: string
  cancelled?: boolean
}

export interface SearchUiResult {
  jobs: JobListing[]
  meta: SearchMeta
  history: SearchHistoryEntry[]
}

export interface TrackerUpdatePatch {
  stage?: TrackerStage
  status?: TrackerStatus
  notes?: string
  reminderAt?: string
  title?: string
  company?: string
  location?: string
}

export interface DesktopApi {
  getPreferences: () => Promise<AppPreferences>
  setPreferences: (partial: Partial<AppPreferences>) => Promise<AppPreferences>
  getProfile: () => Promise<StoredProfileBundle>
  getPipelineStatus: () => Promise<PipelineStatus>
  runSearch: () => Promise<SearchUiResult>
  getSearchHistory: () => Promise<SearchHistoryEntry[]>
  runMatch: (jobs: JobListing[]) => Promise<MatchResult[]>
  notifyBestFits: (matches: MatchResult[]) => Promise<{ notified: number; skippedDuplicate: number }>
  runApply: (jobIds: string[]) => Promise<ApplyResult[]>
  confirmApply: (jobIds: string[]) => Promise<ApplyResult[]>
  runPipeline: () => Promise<{
    jobs: JobListing[]
    matches: MatchResult[]
    notified: number
    meta: SearchMeta
    history: SearchHistoryEntry[]
  }>
  openBrowser: () => Promise<BrowserRuntimeStatus>
  checkSessions: () => Promise<SessionCheckResult[]>
  browserStatus: () => Promise<BrowserRuntimeStatus>
  closeBrowser: () => Promise<BrowserRuntimeStatus>
  importExtensionProfile: () => Promise<ImportUiResult>
  importSampleProfile: () => Promise<ImportUiResult>
  skipExtensionImport: () => Promise<AppPreferences>
  checkOllama: () => Promise<OllamaStatus>
  completeOnboarding: () => Promise<AppPreferences>
  listApplications: () => Promise<ApplicationRow[]>
  updateApplication: (key: string, patch: TrackerUpdatePatch) => Promise<ApplicationRow | null>
  deleteApplication: (key: string) => Promise<ApplicationRow[]>
  exportApplicationsCsv: () => Promise<{ ok: boolean; path?: string; cancelled?: boolean; message: string }>
  checkReminders: () => Promise<{ due: ApplicationRow[]; notified: number }>
  getLastJobs: () => Promise<JobListing[]>
  getLastMatches: () => Promise<MatchResult[]>
  getLastApplyResults: () => Promise<ApplyResult[]>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
