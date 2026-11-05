/** Sections the importer review UI can toggle before applying. */
export type ResumeReviewKey =
  | 'identity'
  | 'links'
  | 'location'
  | 'summary'
  | 'skills'
  | 'workHistory'
  | 'education'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'resumeText'

export const RESUME_REVIEW_DEFAULTS: ResumeReviewKey[] = [
  'identity',
  'links',
  'location',
  'summary',
  'skills',
  'workHistory',
  'education',
  'projects',
  'certifications',
  'languages',
  'resumeText'
]
