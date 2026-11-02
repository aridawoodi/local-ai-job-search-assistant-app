/** Shared domain types used by pipeline modules and the UI. */

import type { BrowserPreference } from './preferences'

export type JobSource = 'google' | 'linkedin' | 'indeed' | 'company' | 'other'

export interface JobListing {
  id: string
  title: string
  company: string
  location?: string
  url: string
  source: JobSource
  snippet?: string
  postedAt?: string
  raw?: Record<string, unknown>
}

export interface MatchResult {
  jobId: string
  score: number
  reasons: string[]
  fits: boolean
  title?: string
  company?: string
  url?: string
  matched?: string[]
  missing?: string[]
}

export type ApplyStatus =
  | 'pending_confirm'
  | 'filled'
  | 'needs_you'
  | 'submitted'
  | 'skipped'
  | 'failed'
  | 'not_implemented'

export interface ApplyFieldReport {
  label: string
  key?: string
  status: 'filled' | 'skipped' | 'missing' | 'needs_you'
  detail?: string
}

export interface ApplyResult {
  jobId: string
  status: ApplyStatus
  message: string
  url?: string
  adapter?: string
  filledCount?: number
  needsYouCount?: number
  fields?: ApplyFieldReport[]
  submitted?: boolean
  stepsAdvanced?: number
}

export type PipelineStage = 'idle' | 'search' | 'match' | 'notify' | 'apply' | 'browser'

export interface PipelineStatus {
  stage: PipelineStage
  message: string
  updatedAt: string
}

export interface BrowserRuntimeStatus {
  implemented: true
  open: boolean
  preferred: BrowserPreference
  channel: 'chrome' | 'msedge' | null
  profileDir: string | null
  message: string
  profileNote: string
}

export interface SessionCheckResult {
  source: 'indeed' | 'linkedin' | 'google'
  ready: boolean
  needsLogin: boolean
  message: string
  url: string
}

export interface SourceSearchMeta {
  source: JobSource
  usedFixture: boolean
  message: string
  searchUrl: string
  jobCount: number
}

export interface SearchMeta {
  sources: SourceSearchMeta[]
  usedFixture: boolean
  message: string
  searchUrl: string
  query: string
  location: string
  runId: string
}

export interface SearchHistoryEntry {
  id: string
  at: string
  query: string
  location: string
  jobCount: number
  sources: JobSource[]
  message: string
}
