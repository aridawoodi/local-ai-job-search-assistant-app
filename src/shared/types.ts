/** Shared domain types used by pipeline modules and the UI. */

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
}

export interface ApplyResult {
  jobId: string
  status: 'pending_confirm' | 'submitted' | 'skipped' | 'failed' | 'not_implemented'
  message: string
}

export type PipelineStage = 'idle' | 'search' | 'match' | 'notify' | 'apply'

export interface PipelineStatus {
  stage: PipelineStage
  message: string
  updatedAt: string
}
