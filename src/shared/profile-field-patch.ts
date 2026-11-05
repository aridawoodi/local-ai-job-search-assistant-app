/**
 * Map apply-fill field keys → UserProfile paths for inline Apply edits.
 */

import type { UserProfile } from './profile'

/** Apply a fill-field key/value onto a profile clone. Returns null if key is unknown. */
export function patchProfileField(
  profile: UserProfile,
  key: string | undefined,
  value: string
): UserProfile | null {
  if (!key) return null
  const next: UserProfile = {
    ...profile,
    education: { ...profile.education },
    eeo: { ...profile.eeo },
    workHistory: [...(profile.workHistory || [])],
    educationList: [...(profile.educationList || [])],
    projects: [...(profile.projects || [])],
    skills: [...(profile.skills || [])],
    certifications: [...(profile.certifications || [])],
    languages: [...(profile.languages || [])]
  }
  const v = value

  switch (key) {
    case 'preferredName':
      next.preferredName = v
      break
    case 'firstName':
      next.firstName = v
      break
    case 'lastName':
      next.lastName = v
      break
    case 'fullName': {
      const parts = v.trim().split(/\s+/)
      if (parts.length >= 2) {
        next.firstName = parts[0]
        next.lastName = parts.slice(1).join(' ')
      } else if (parts.length === 1) {
        next.firstName = parts[0]
      }
      break
    }
    case 'email':
      next.email = v
      break
    case 'phone':
      next.phone = v
      break
    case 'linkedin':
      next.linkedin = v
      break
    case 'github':
      next.github = v
      break
    case 'portfolio':
      next.portfolio = v
      next.website = next.website || v
      break
    case 'zip':
      next.zip = v
      break
    case 'city':
      next.city = v
      break
    case 'state':
      next.state = v
      break
    case 'country':
      next.country = v
      break
    case 'location':
      next.location = v
      break
    case 'over18':
      next.over18 = v
      break
    case 'sponsorship':
      next.needsSponsorship = v
      break
    case 'workAuth':
      next.workAuthorizedUS = v
      break
    case 'currentTitle':
    case 'jobTitle':
      next.currentTitle = v
      break
    case 'currentEmployer':
    case 'company':
      next.currentEmployer = v
      break
    case 'school':
      next.education.school = v
      break
    case 'degree':
      next.education.degree = v
      break
    case 'discipline':
      next.education.field = v
      break
    case 'yearsExperience':
      next.yearsExperience = v
      break
    case 'availability':
      next.availability = v
      break
    case 'startDate':
      next.currentStartDate = v
      break
    case 'relocate':
      next.willingToRelocate = v
      break
    case 'hearAbout':
      next.howDidYouHear = v
      break
    case 'signature':
      next.signature = v
      break
    case 'salary':
      next.salaryExpectation = v
      break
    case 'gender':
      next.eeo.gender = v
      break
    case 'veteran':
      next.eeo.veteran = v
      break
    case 'disability':
      next.eeo.disability = v
      break
    case 'ethnicity':
      next.eeo.ethnicity = v
      break
    default:
      return null
  }
  return next
}

/** Read the current profile value for a fill key (for change detection). */
export function readProfileField(profile: UserProfile, key: string | undefined): string {
  if (!key) return ''
  switch (key) {
    case 'preferredName':
      return profile.preferredName || ''
    case 'firstName':
      return profile.firstName || ''
    case 'lastName':
      return profile.lastName || ''
    case 'fullName':
      return [profile.firstName, profile.lastName].filter(Boolean).join(' ')
    case 'email':
      return profile.email || ''
    case 'phone':
      return profile.phone || ''
    case 'linkedin':
      return profile.linkedin || ''
    case 'github':
      return profile.github || ''
    case 'portfolio':
      return profile.portfolio || profile.website || ''
    case 'zip':
      return profile.zip || ''
    case 'city':
      return profile.city || ''
    case 'state':
      return profile.state || ''
    case 'country':
      return profile.country || ''
    case 'location':
      return profile.location || [profile.city, profile.state].filter(Boolean).join(', ')
    case 'over18':
      return profile.over18 || ''
    case 'sponsorship':
      return profile.needsSponsorship || ''
    case 'workAuth':
      return profile.workAuthorizedUS || ''
    case 'currentTitle':
    case 'jobTitle':
      return profile.currentTitle || ''
    case 'currentEmployer':
    case 'company':
      return profile.currentEmployer || ''
    case 'school':
      return profile.education?.school || ''
    case 'degree':
      return profile.education?.degree || ''
    case 'discipline':
      return profile.education?.field || ''
    case 'yearsExperience':
      return profile.yearsExperience || ''
    case 'availability':
      return profile.availability || profile.noticePeriod || ''
    case 'startDate':
      return profile.currentStartDate || ''
    case 'relocate':
      return profile.willingToRelocate || ''
    case 'hearAbout':
      return profile.howDidYouHear || ''
    case 'signature':
      return profile.signature || ''
    case 'salary':
      return profile.salaryExpectation || ''
    case 'gender':
      return profile.eeo?.gender || ''
    case 'veteran':
      return profile.eeo?.veteran || ''
    case 'disability':
      return profile.eeo?.disability || ''
    case 'ethnicity':
      return profile.eeo?.ethnicity || ''
    default:
      return ''
  }
}
