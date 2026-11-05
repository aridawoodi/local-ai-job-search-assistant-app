import type { AppPreferences } from './preferences'
import type { AnswerBankEntry, StoredProfileBundle, UserProfile } from './profile'
import type { OllamaStatus } from './ollama'
import type { ApplicationRow, TrackerStage, TrackerStatus } from './tracker'
import type { PipelinePause } from './pause'
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
import type { TailorResult } from '../modules/ai/tailor'
import type { CoverResult, CoverLength } from '../modules/ai/cover'
import type { RefineResult, RefineMode } from '../modules/ai/refine'
import type { ResumeImportResult, ResumeImportPatch } from '../modules/resume/import'
import type { MergeBankResult } from './answer-bank'
import type { AiRereadResult } from '../modules/resume/ai-reread'

export type { OllamaStatus }

export interface DesktopDiagnostics {
  version: string
  platform: string
  arch: string
  ollamaReachable: boolean
  ollamaModelCount: number
  ollamaModelHint?: string
  useLlm: boolean
  profileComplete: boolean
  profileMissing: string[]
  resumeSaved: boolean
  browserOpen: boolean
  browserChannel: string | null
  lastFill: { filled: number; needsYou: number; skipped: number } | null
}

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
  pause?: PipelinePause
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

export interface AiJobInput {
  title?: string
  company?: string
  description?: string
  jobId?: string
}

export interface DesktopApi {
  getPreferences: () => Promise<AppPreferences>
  setPreferences: (partial: Partial<AppPreferences>) => Promise<AppPreferences>
  getProfile: () => Promise<StoredProfileBundle>
  saveProfile: (profile: UserProfile) => Promise<StoredProfileBundle>
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
    pause?: PipelinePause
  }>
  openBrowser: () => Promise<BrowserRuntimeStatus>
  checkSessions: () => Promise<SessionCheckResult[]>
  browserStatus: () => Promise<BrowserRuntimeStatus>
  closeBrowser: () => Promise<BrowserRuntimeStatus>
  getPipelinePause: () => Promise<PipelinePause>
  clearPipelinePause: () => Promise<PipelinePause>
  resumeAfterPause: () => Promise<{
    pause: PipelinePause
    sessions: SessionCheckResult[]
  }>
  importExtensionProfile: () => Promise<ImportUiResult>
  importSampleProfile: () => Promise<ImportUiResult>
  skipExtensionImport: () => Promise<AppPreferences>
  checkOllama: () => Promise<OllamaStatus>
  completeOnboarding: () => Promise<AppPreferences>
  listApplications: () => Promise<ApplicationRow[]>
  updateApplication: (key: string, patch: TrackerUpdatePatch) => Promise<ApplicationRow | null>
  deleteApplication: (key: string) => Promise<ApplicationRow[]>
  exportApplicationsCsv: () => Promise<{ ok: boolean; path?: string; cancelled?: boolean; message: string }>
  exportProfile: () => Promise<{ ok: boolean; path?: string; cancelled?: boolean; message: string }>
  exportFullBackup: () => Promise<{ ok: boolean; path?: string; cancelled?: boolean; message: string }>
  checkReminders: () => Promise<{ due: ApplicationRow[]; notified: number }>
  runScheduledNow: () => Promise<{ ok: boolean; message: string }>
  getLastJobs: () => Promise<JobListing[]>
  getLastMatches: () => Promise<MatchResult[]>
  getLastApplyResults: () => Promise<ApplyResult[]>
  importResume: () => Promise<ResumeImportResult & { cancelled?: boolean }>
  commitResumeImport: (payload: {
    patch: ResumeImportPatch
    resumeText: string
    selected: import('./resume-review').ResumeReviewKey[]
    parsed?: { name: string; kind: 'pdf' | 'docx' }
  }) => Promise<ResumeImportResult>
  rereadResumeWithAi: (payload: {
    resumeText: string
    patch: ResumeImportPatch
  }) => Promise<AiRereadResult>
  getDiagnostics: () => Promise<DesktopDiagnostics>
  openPracticeTour: () => Promise<{ ok: boolean; message: string }>
  /**
   * Open a job posting in the automation browser.
   * Live HTTPS URLs open as-is; only true fixtures fall back to the practice form.
   */
  openJobPosting: (jobId: string) => Promise<{
    ok: boolean
    usedPractice: boolean
    message: string
    url?: string
  }>
  /** Persist an inline Apply field edit to profile and/or answer bank. */
  saveFillAnswer: (payload: {
    label: string
    key?: string
    value: string
    saveForFuture: boolean
  }) => Promise<{ ok: boolean; message: string; savedProfile: boolean; savedBank: boolean }>
  listAnswerBank: () => Promise<AnswerBankEntry[]>
  upsertAnswerBank: (entries: AnswerBankEntry[]) => Promise<MergeBankResult & { bank: AnswerBankEntry[] }>
  deleteAnswerBank: (index: number) => Promise<AnswerBankEntry[]>
  aiTailor: (job: AiJobInput) => Promise<TailorResult>
  aiCover: (job: AiJobInput, length?: CoverLength) => Promise<CoverResult>
  aiRefine: (text: string, mode?: RefineMode, question?: string) => Promise<RefineResult>
  applyTailorToProfile: (summary: string, skillsLine: string) => Promise<StoredProfileBundle>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
