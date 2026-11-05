import type { UserProfile } from './profile'
import { fieldOn } from './field-groups'

/**
 * Blank profile values the user turned off in Settings → Fields to fill,
 * so Playwright fill leaves those inputs empty (extension fieldOn behaviour).
 */
export function maskProfileForFill(
  profile: UserProfile,
  toggles: Record<string, boolean> | undefined
): UserProfile {
  const p: UserProfile = {
    ...profile,
    eeo: { ...profile.eeo },
    education: { ...profile.education },
    workHistory: [...(profile.workHistory || [])],
    educationList: [...(profile.educationList || [])],
    projects: [...(profile.projects || [])],
    skills: [...(profile.skills || [])],
    certifications: [...(profile.certifications || [])],
    languages: [...(profile.languages || [])]
  }

  const off = (key: string) => !fieldOn(toggles, key)

  if (off('firstName')) p.firstName = ''
  if (off('lastName')) p.lastName = ''
  if (off('preferredName')) p.preferredName = ''
  if (off('pronouns')) p.pronouns = ''
  if (off('email')) p.email = ''
  if (off('phone')) p.phone = ''
  if (off('location')) {
    p.location = ''
    p.city = ''
    p.state = ''
    p.zip = ''
    p.country = ''
  }
  if (off('signature')) p.signature = ''
  if (off('linkedin')) p.linkedin = ''
  if (off('github')) p.github = ''
  if (off('portfolio')) {
    p.portfolio = ''
    p.website = ''
  }
  if (off('currentEmployer')) p.currentEmployer = ''
  if (off('currentTitle')) p.currentTitle = ''
  if (off('yearsExperience')) p.yearsExperience = ''
  if (off('jobDescription')) p.workHistory = []
  if (off('school') || off('degree') || off('gradYear')) {
    if (off('school')) {
      p.education.school = ''
      p.educationList = p.educationList.map((e) => ({ ...e, school: '' }))
    }
    if (off('degree')) {
      p.education.degree = ''
      p.education.field = ''
      p.educationList = p.educationList.map((e) => ({
        ...e,
        degree: '',
        degreeText: '',
        field: ''
      }))
    }
    if (off('gradYear')) {
      p.education.startYear = ''
      p.education.endYear = ''
      p.educationList = p.educationList.map((e) => ({
        ...e,
        start: '',
        end: '',
        startYear: '',
        endYear: ''
      }))
    }
  }
  if (off('workAuth')) p.workAuthorizedUS = ''
  if (off('sponsorship')) p.needsSponsorship = ''
  if (off('salary')) p.salaryExpectation = ''
  if (off('availability')) {
    p.availability = ''
    p.noticePeriod = ''
  }
  if (off('relocate')) p.willingToRelocate = ''
  if (off('hearAbout')) p.howDidYouHear = ''
  if (off('gender')) p.eeo.gender = ''
  if (off('transgender')) p.eeo.transgender = ''
  if (off('sexualOrientation')) p.eeo.sexualOrientation = ''
  if (off('ethnicity')) p.eeo.ethnicity = ''
  if (off('hispanic')) p.eeo.hispanicLatino = ''
  if (off('veteran')) p.eeo.veteran = ''
  if (off('disability')) p.eeo.disability = ''

  return p
}
