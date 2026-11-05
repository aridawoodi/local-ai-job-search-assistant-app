import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, TrackerUpdatePatch, AiJobInput } from '../../src/shared/ipc'
import type { AppPreferences } from '../../src/shared/preferences'
import type { AnswerBankEntry, UserProfile } from '../../src/shared/profile'
import type { JobListing, MatchResult } from '../../src/shared/types'
import type { CoverLength } from '../../src/modules/ai/cover'
import type { RefineMode } from '../../src/modules/ai/refine'

const api: DesktopApi = {
  getPreferences: () => ipcRenderer.invoke('prefs:get'),
  setPreferences: (partial: Partial<AppPreferences>) =>
    ipcRenderer.invoke('prefs:set', partial),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (profile: UserProfile) => ipcRenderer.invoke('profile:save', profile),
  getPipelineStatus: () => ipcRenderer.invoke('pipeline:status'),
  runSearch: () => ipcRenderer.invoke('pipeline:search'),
  getSearchHistory: () => ipcRenderer.invoke('pipeline:search-history'),
  runMatch: (jobs: JobListing[]) => ipcRenderer.invoke('pipeline:match', jobs),
  notifyBestFits: (matches: MatchResult[]) =>
    ipcRenderer.invoke('pipeline:notify', matches),
  runApply: (jobIds: string[]) => ipcRenderer.invoke('pipeline:apply', jobIds),
  confirmApply: (jobIds: string[]) =>
    ipcRenderer.invoke('pipeline:confirm-apply', jobIds),
  runPipeline: () => ipcRenderer.invoke('pipeline:run'),
  openBrowser: () => ipcRenderer.invoke('browser:open'),
  checkSessions: () => ipcRenderer.invoke('browser:check-sessions'),
  browserStatus: () => ipcRenderer.invoke('browser:status'),
  closeBrowser: () => ipcRenderer.invoke('browser:close'),
  getPipelinePause: () => ipcRenderer.invoke('pipeline:pause-get'),
  clearPipelinePause: () => ipcRenderer.invoke('pipeline:pause-clear'),
  resumeAfterPause: () => ipcRenderer.invoke('pipeline:pause-resume'),
  importExtensionProfile: () => ipcRenderer.invoke('import:extension'),
  importSampleProfile: () => ipcRenderer.invoke('import:sample'),
  skipExtensionImport: () => ipcRenderer.invoke('import:skip'),
  checkOllama: () => ipcRenderer.invoke('ollama:check'),
  completeOnboarding: () => ipcRenderer.invoke('onboarding:complete'),
  listApplications: () => ipcRenderer.invoke('tracker:list'),
  updateApplication: (key: string, patch: TrackerUpdatePatch) =>
    ipcRenderer.invoke('tracker:update', key, patch),
  deleteApplication: (key: string) => ipcRenderer.invoke('tracker:delete', key),
  exportApplicationsCsv: () => ipcRenderer.invoke('tracker:export-csv'),
  exportProfile: () => ipcRenderer.invoke('export:profile'),
  exportFullBackup: () => ipcRenderer.invoke('export:backup'),
  checkReminders: () => ipcRenderer.invoke('tracker:check-reminders'),
  runScheduledNow: () => ipcRenderer.invoke('pipeline:schedule-now'),
  getLastJobs: () => ipcRenderer.invoke('pipeline:last-jobs'),
  getLastMatches: () => ipcRenderer.invoke('pipeline:last-matches'),
  getLastApplyResults: () => ipcRenderer.invoke('pipeline:last-apply'),
  importResume: () => ipcRenderer.invoke('resume:import'),
  commitResumeImport: (payload: {
    patch: import('../../src/modules/resume').ResumeImportPatch
    resumeText: string
    selected: import('../../src/modules/resume').ResumeReviewKey[]
    parsed?: { name: string; kind: 'pdf' | 'docx' }
  }) => ipcRenderer.invoke('resume:commit', payload),
  rereadResumeWithAi: (payload: {
    resumeText: string
    patch: import('../../src/modules/resume').ResumeImportPatch
  }) => ipcRenderer.invoke('resume:ai-reread', payload),
  getDiagnostics: () => ipcRenderer.invoke('diag:info'),
  openPracticeTour: () => ipcRenderer.invoke('practice:open'),
  openJobPosting: (jobId: string) => ipcRenderer.invoke('jobs:open-posting', jobId),
  saveFillAnswer: (payload: {
    label: string
    key?: string
    value: string
    saveForFuture: boolean
  }) => ipcRenderer.invoke('apply:save-fill-answer', payload),
  listAnswerBank: () => ipcRenderer.invoke('answerbank:list'),
  upsertAnswerBank: (entries: AnswerBankEntry[]) =>
    ipcRenderer.invoke('answerbank:upsert', entries),
  deleteAnswerBank: (index: number) => ipcRenderer.invoke('answerbank:delete', index),
  aiTailor: (job: AiJobInput) => ipcRenderer.invoke('ai:tailor', job),
  aiCover: (job: AiJobInput, length?: CoverLength) =>
    ipcRenderer.invoke('ai:cover', job, length),
  aiRefine: (text: string, mode?: RefineMode, question?: string) =>
    ipcRenderer.invoke('ai:refine', text, mode, question),
  applyTailorToProfile: (summary: string, skillsLine: string) =>
    ipcRenderer.invoke('ai:apply-tailor', summary, skillsLine)
}

contextBridge.exposeInMainWorld('desktopApi', api)
