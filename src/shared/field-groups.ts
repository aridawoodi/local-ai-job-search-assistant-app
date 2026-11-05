/**
 * Extension Options → Fields to fill groups (lib/defaults.js FIELD_GROUPS).
 * Desktop stores the same toggle keys under preferences.fieldToggles.
 */

export type FieldToggleKey = string

export const FIELD_GROUPS: Array<[string, Array<[FieldToggleKey, string]>]> = [
  [
    'Personal',
    [
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['fullName', 'Full name'],
      ['preferredName', 'Preferred name'],
      ['pronouns', 'Pronouns'],
      ['email', 'Email'],
      ['phone', 'Phone'],
      ['location', 'Location'],
      ['signature', 'Signature & date']
    ]
  ],
  [
    'Documents',
    [
      ['resume', 'Resume upload'],
      ['coverLetter', 'Cover letter']
    ]
  ],
  [
    'Education',
    [
      ['school', 'School'],
      ['degree', 'Degree'],
      ['gradYear', 'Start / graduation year']
    ]
  ],
  [
    'Experience',
    [
      ['currentEmployer', 'Current company'],
      ['currentTitle', 'Current title'],
      ['yearsExperience', 'Years of experience'],
      ['jobDescription', 'Job descriptions (work history entries)']
    ]
  ],
  [
    'EEO',
    [
      ['gender', 'Gender'],
      ['transgender', 'Transgender'],
      ['sexualOrientation', 'Sexual orientation'],
      ['ethnicity', 'Race / ethnicity'],
      ['hispanic', 'Hispanic or Latino'],
      ['veteran', 'Veteran status'],
      ['disability', 'Disability']
    ]
  ],
  [
    'Work authorization',
    [
      ['workAuth', 'Work authorization'],
      ['sponsorship', 'Sponsorship'],
      ['citizenship', 'Citizenship']
    ]
  ],
  [
    'Links',
    [
      ['linkedin', 'LinkedIn'],
      ['github', 'GitHub'],
      ['portfolio', 'Portfolio / website']
    ]
  ],
  [
    'Other',
    [
      ['salary', 'Salary expectation'],
      ['availability', 'Availability / start date'],
      ['relocate', 'Relocation'],
      ['hearAbout', 'How did you hear about us'],
      ['bank', 'Saved answers (answer bank)'],
      ['ai', 'Local AI answers']
    ]
  ]
]

export function defaultFieldToggles(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [, items] of FIELD_GROUPS) {
    for (const [key] of items) out[key] = true
  }
  return out
}

/** True unless the user explicitly turned the toggle off. */
export function fieldOn(
  toggles: Record<string, boolean> | undefined,
  key: string
): boolean {
  if (!toggles) return true
  return toggles[key] !== false
}
