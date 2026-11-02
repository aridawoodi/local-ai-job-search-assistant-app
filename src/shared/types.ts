/** Shared domain types used by pipeline modules and the UI. */

import type { BrowserPreference } from './preferences'

export interface JobListing {
  id: string
  title: string
  company: string
  location?: string
  url: string
  source: 'google' | 'linkedin' | 'indeed' | 'company' | 'other'
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

export interface ApplyResult {
  jobId: string
  status: 'pending_confirm' | 'submitted' | 'skipped' | 'failed' | 'not_implemented'
  message: string
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

export interface SearchMeta {
  source: 'indeed'
  usedFixture: boolean
  message: string
  searchUrl: string
  query: string
  location: string
}
