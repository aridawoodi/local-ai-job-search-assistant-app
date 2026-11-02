/**
 * Profile schema aligned with Job Apply Assistant extension EMPTY_PROFILE.
 * Ported for import compatibility — extension repo remains read-only.
 */

import type { ApplicationRow } from './tracker'

export interface EducationEntry {
  school?: string
  degree?: string
  field?: string
  location?: string
  startYear?: string
  endYear?: string
  start?: string
  end?: string
  status?: string
  highest?: boolean
  degreeText?: string
}

export interface WorkHistoryEntry {
  company?: string
  title?: string
  location?: string
  start?: string
  end?: string
  current?: boolean
  bullets?: string[]
}

export interface ProjectEntry {
  name?: string
  link?: string
  start?: string
  end?: string
  role?: string
  description?: string
  bullets?: string[]
  tech?: string[]
}

export interface EeoFields {
  gender?: string
  transgender?: string
  sexualOrientation?: string
  disability?: string
  veteran?: string
  ethnicity?: string
  hispanicLatino?: string
}

export interface UserProfile {
  firstName: string
  lastName: string
  preferredName: string
  pronouns: string
  email: string
  phone: string
  city: string
  state: string
  country: string
  zip: string
  location: string
  linkedin: string
  github: string
  portfolio: string
  website: string
  workAuthorizedUS: string
  needsSponsorship: string
  citizenship: string
  over18: string
  currentEmployer: string
  currentTitle: string
  currentStartDate: string
  yearsExperience: string
  education: EducationEntry
  eeo: EeoFields
  availability: string
  noticePeriod: string
  salaryExpectation: string
  willingToRelocate: string
  howDidYouHear: string
  signature: string
  summary: string
  resumeText: string
  writingSamples: string
  toneNotes: string
  workHistory: WorkHistoryEntry[]
  educationList: EducationEntry[]
  projects: ProjectEntry[]
  skills: string[]
  certifications: string[]
  languages: string[]
}

export interface AnswerBankEntry {
  q: string
  a: string
  source?: string
  companySpecific?: boolean
}

export interface ExtensionSettings {
  ollamaUrl?: string
  model?: string
  useLLM?: boolean
  aiEngine?: string
  [key: string]: unknown
}

export interface StoredProfileBundle {
  profile: UserProfile
  answerBank: AnswerBankEntry[]
  settings: ExtensionSettings
  applications: ApplicationRow[]
  resume?: unknown
  importedFrom?: string
  importedAt?: string
}

export const EMPTY_PROFILE: UserProfile = {
  firstName: '',
  lastName: '',
  preferredName: '',
  pronouns: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  country: '',
  zip: '',
  location: '',
  linkedin: '',
  github: '',
  portfolio: '',
  website: '',
  workAuthorizedUS: '',
  needsSponsorship: '',
  citizenship: '',
  over18: '',
  currentEmployer: '',
  currentTitle: '',
  currentStartDate: '',
  yearsExperience: '',
  education: {
    school: '',
    degree: '',
    field: '',
    location: '',
    startYear: '',
    endYear: ''
  },
  eeo: {
    gender: '',
    transgender: '',
    sexualOrientation: '',
    disability: '',
    veteran: '',
    ethnicity: '',
    hispanicLatino: ''
  },
  availability: '',
  noticePeriod: '',
  salaryExpectation: '',
  willingToRelocate: '',
  howDidYouHear: '',
  signature: '',
  summary: '',
  resumeText: '',
  writingSamples: '',
  toneNotes: '',
  workHistory: [],
  educationList: [],
  projects: [],
  skills: [],
  certifications: [],
  languages: []
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:3b',
  useLLM: true,
  aiEngine: 'ollama'
}

export function emptyBundle(): StoredProfileBundle {
  return {
    profile: { ...EMPTY_PROFILE, education: { ...EMPTY_PROFILE.education }, eeo: { ...EMPTY_PROFILE.eeo } },
    answerBank: [],
    settings: { ...DEFAULT_EXTENSION_SETTINGS },
    applications: []
  }
}

export function profileDisplayName(p: UserProfile): string {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
  return name || p.preferredName || p.email || 'No profile yet'
}
