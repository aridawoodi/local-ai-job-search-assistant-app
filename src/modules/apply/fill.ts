/**
 * Playwright apply-fill helpers — ported patterns from extension content/core.js
 * + content/sites.js (read-only). Never clicks Submit / Apply / Next / Continue.
 */
import type { Page } from 'playwright'
import type { UserProfile } from '../../shared/profile'
import type { ApplyFieldReport } from '../../shared/types'

export interface FillPageResult {
  adapter: string
  filledCount: number
  needsYouCount: number
  skippedCount: number
  fields: ApplyFieldReport[]
  message: string
  formFound: boolean
  submitted: false
}

interface InjectedResult {
  adapter: string
  formFound: boolean
  fields: ApplyFieldReport[]
  filledCount: number
  needsYouCount: number
  skippedCount: number
}

/** Detect ATS adapter name from URL (mirrors extension sites.js matchers). */
export function detectAdapter(url: string): string {
  try {
    const host = new URL(url).hostname
    if (/(^|\.)greenhouse\.io$/.test(host)) return 'Greenhouse'
    if (/(^|\.)lever\.co$/.test(host)) return 'Lever'
    if (/(^|\.)ashbyhq\.com$/.test(host)) return 'Ashby'
    if (/(^|\.)myworkdayjobs\.com$|(^|\.)myworkday\.com$/.test(host)) return 'Workday'
    if (/(^|\.)linkedin\.com$/.test(host)) return 'LinkedIn Easy Apply'
  } catch {
    /* ignore */
  }
  return 'Generic'
}

/**
 * Fill the visible application form on the current page from the imported profile.
 * Hard invariant: never presses submit/apply/next — even in unattended mode (M3).
 */
export async function fillApplicationPage(
  page: Page,
  profile: UserProfile
): Promise<FillPageResult> {
  const url = page.url()
  const adapter = detectAdapter(url)

  // LinkedIn Easy Apply only fills an open modal — surface a clear hint.
  if (adapter === 'LinkedIn Easy Apply') {
    const hasModal = await page.evaluate(() => {
      const t = (el: Element | null) =>
        el ? (el as HTMLElement).innerText || el.textContent || '' : ''
      return Boolean(
        document.querySelector('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]') ||
          Array.from(document.querySelectorAll('[role="dialog"]')).find((d) =>
            /apply to|easy apply/i.test(t(d).slice(0, 200))
          )
      )
    })
    if (!hasModal) {
      return {
        adapter,
        filledCount: 0,
        needsYouCount: 0,
        skippedCount: 0,
        fields: [],
        formFound: false,
        submitted: false,
        message:
          'LinkedIn Easy Apply: open the Easy Apply modal first. Fill never presses Next/Submit.'
      }
    }
  }

  const profilePayload = serializeProfile(profile)

  const injected = await page.evaluate((profileJson) => {
    const SUBMITTY =
      /\b(submit|apply|send|finish|complete application|review application|next|continue|save and continue)\b/i

    type FieldReport = {
      label: string
      key?: string
      status: 'filled' | 'skipped' | 'missing' | 'needs_you'
      detail?: string
    }

    const p = profileJson as {
      firstName: string
      lastName: string
      preferredName: string
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
      over18: string
      currentEmployer: string
      currentTitle: string
      yearsExperience: string
      availability: string
      noticePeriod: string
      salaryExpectation: string
      willingToRelocate: string
      howDidYouHear: string
      signature: string
      education: { school?: string; degree?: string; field?: string }
      eeo: Record<string, string>
    }

    const norm = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9+.#]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const textOf = (el: Element | null) =>
      el ? ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : ''

    const isVisible = (el: Element) => {
      const r = (el as HTMLElement).getClientRects?.()
      return !!(r && r.length)
    }

    function labelFor(el: HTMLElement): string {
      const id = el.id
      if (id) {
        const byFor = document.querySelector(`label[for="${CSS.escape ? CSS.escape(id) : id}"]`)
        if (byFor) return textOf(byFor)
      }
      const wrap = el.closest('label')
      if (wrap) return textOf(wrap)
      const box = el.closest(
        '.application-question, [data-automation-id^="formField"], .field, .form-group, [class*="field" i], [class*="question" i]'
      )
      if (box) {
        const lab = box.querySelector('label, .application-label, legend, [class*="label" i]')
        if (lab) return textOf(lab)
      }
      return (
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('name') ||
        el.id ||
        ''
      )
    }

    type Rule = {
      key: string
      re: RegExp
      value: string
      never?: boolean
      eeo?: boolean
      why?: string
      short?: boolean
    }

    const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ')
    const rules: Rule[] = [
      {
        key: 'consent',
        re: /\b(consent|i agree|agree to|terms|privacy|arbitrat)/,
        value: '',
        never: true,
        why: 'Consent/agreement — answer yourself.'
      },
      {
        key: 'ssn/dob',
        re: /\b(social security|ssn|date of birth|birth ?date|dob)\b/,
        value: '',
        never: true,
        why: 'Sensitive (SSN/DOB) — fill yourself.'
      },
      { key: 'salary', re: /\b(salary|compensation|pay expectation|desired pay)\b/, value: p.salaryExpectation || '' },
      {
        key: 'preferredName',
        re: /\b(preferred (first )?name|nick ?name)\b/,
        value: p.preferredName || p.firstName || ''
      },
      { key: 'firstName', re: /\b(first name|given name|firstname|fname)\b/, value: p.firstName || '', short: true },
      { key: 'lastName', re: /\b(last name|surname|family name|lastname|lname)\b/, value: p.lastName || '', short: true },
      {
        key: 'fullName',
        re: /^(full |legal |your )?name( full)?$|^(full|legal) name\b/,
        value: fullName,
        short: true
      },
      { key: 'email', re: /\be ?mail\b/, value: p.email || '', short: true },
      { key: 'phone', re: /\b(phone|mobile|cell|telephone)\b/, value: p.phone || '', short: true },
      { key: 'linkedin', re: /\blinked ?in\b/, value: p.linkedin || '', short: true },
      { key: 'github', re: /\bgit ?hub\b/, value: p.github || '', short: true },
      {
        key: 'portfolio',
        re: /\b(portfolio|personal (web ?site|site)|web ?site)\b/,
        value: p.portfolio || p.website || '',
        short: true
      },
      { key: 'zip', re: /\b(zip|postal)( code)?\b/, value: p.zip || '', short: true },
      { key: 'city', re: /^(current )?city\b/, value: p.city || '', short: true },
      { key: 'state', re: /^(state|province|region)\b/, value: p.state || '', short: true },
      { key: 'country', re: /^(country|country of residence)\b/, value: p.country || '', short: true },
      {
        key: 'location',
        re: /^(location|current location|address|home address)\b/,
        value: p.location || [p.city, p.state].filter(Boolean).join(', '),
        short: true
      },
      { key: 'over18', re: /\b(18 years|over the age of 18|at least 18)\b/, value: p.over18 || '' },
      { key: 'sponsorship', re: /\b(sponsor|sponsorship|h ?1 ?b|visa)\b/, value: p.needsSponsorship || '' },
      {
        key: 'workAuth',
        re: /\b(authori[sz]ed to work|eligible to work|work authori[sz]ation)\b/,
        value: p.workAuthorizedUS || ''
      },
      {
        key: 'currentTitle',
        re: /\b(current (job )?title|current (role|position)|job title|^title$)\b/,
        value: p.currentTitle || '',
        short: true
      },
      {
        key: 'currentEmployer',
        re: /\b(current (company|employer)|^company( name)?$|^employer$)\b/,
        value: p.currentEmployer || '',
        short: true
      },
      { key: 'school', re: /\b(school|university|college|institution)\b/, value: p.education?.school || '' },
      { key: 'degree', re: /^(degree|highest (level of )?education|education level)\b/, value: p.education?.degree || '', short: true },
      { key: 'discipline', re: /\b(discipline|field of study|major)\b/, value: p.education?.field || '', short: true },
      { key: 'yearsExperience', re: /\byears of (relevant |professional |work )?experience\b/, value: p.yearsExperience || '' },
      {
        key: 'availability',
        re: /\b(when can you start|start date|availability|notice period)\b/,
        value: p.availability || p.noticePeriod || ''
      },
      { key: 'relocate', re: /\brelocat/, value: p.willingToRelocate || '' },
      { key: 'hearAbout', re: /\b(how did you (hear|find|learn)|referral source)\b/, value: p.howDidYouHear || '' },
      { key: 'signature', re: /\b(signature|e ?sign|type your (full )?name)\b/, value: p.signature || fullName },
      { key: 'gender', re: /\b(gender|sex)\b/, value: p.eeo?.gender || '', eeo: true },
      { key: 'veteran', re: /\b(veteran|military|armed forces)\b/, value: p.eeo?.veteran || '', eeo: true },
      { key: 'disability', re: /\bdisabilit/, value: p.eeo?.disability || '', eeo: true },
      { key: 'ethnicity', re: /\b(race|ethnicity|ethnic|racial)\b/, value: p.eeo?.ethnicity || '', eeo: true }
    ]

    function matchRule(label: string, name: string, id: string, autocomplete: string): Rule | null {
      const L = norm(label)
      const meta = norm(`${name} ${id}`)
      const short = L.split(' ').filter(Boolean).length <= 8
      for (const r of rules) {
        if (L && r.re.test(L) && (!r.short || short)) return r
      }
      const acMap: Record<string, string> = {
        'given-name': 'firstName',
        'family-name': 'lastName',
        name: 'fullName',
        email: 'email',
        tel: 'phone',
        'postal-code': 'zip',
        'address-level2': 'city',
        'address-level1': 'state',
        country: 'country',
        'organization-title': 'currentTitle',
        organization: 'currentEmployer'
      }
      const acKey = acMap[String(autocomplete || '').toLowerCase()]
      if (acKey) {
        const r = rules.find((x) => x.key === acKey)
        if (r) return r
      }
      if (meta) {
        for (const r of rules) {
          if (r.re.test(meta)) return r
        }
      }
      return null
    }

    function fire(el: HTMLElement, type: string) {
      const Ev =
        /^(focus|blur|focusin|focusout)$/.test(type)
          ? FocusEvent
          : /^key/.test(type)
            ? KeyboardEvent
            : Event
      el.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true }))
    }

    function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : el instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      desc?.set?.call(el, v)
    }

    function typeInto(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
      try {
        el.focus({ preventScroll: true })
      } catch {
        /* ignore */
      }
      fire(el, 'focusin')
      setNativeValue(el, v)
      fire(el, 'input')
      fire(el, 'change')
      fire(el, 'blur')
    }

    // Block accidental form submits while filling (extension invariant).
    let filling = true
    const blocker = (e: Event) => {
      if (!filling) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('submit', blocker, true)

    const host = location.hostname
    let formRoot: Element | Document = document
    if (/(^|\.)greenhouse\.io$/.test(host)) {
      formRoot =
        document.querySelector('#application-form, #application_form, form#application, .application--form') ||
        document
    } else if (/(^|\.)lever\.co$/.test(host)) {
      formRoot =
        document.querySelector('#application-form, form[action*="apply"], .application-form') || document
    } else if (/(^|\.)ashbyhq\.com$/.test(host)) {
      formRoot =
        document.querySelector('.ashby-application-form-container, [class*="application-form" i], form') ||
        document
    } else if (/linkedin\.com/.test(host)) {
      formRoot =
        document.querySelector('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]') ||
        Array.from(document.querySelectorAll('[role="dialog"]')).find((d) =>
          /apply to|easy apply/i.test(textOf(d).slice(0, 200))
        ) ||
        document
    } else {
      formRoot =
        document.querySelector('#application-form, form[id*="application" i], form') || document
    }

    const controls = Array.from(
      formRoot.querySelectorAll('input, textarea, select')
    ) as HTMLElement[]

    const reports: FieldReport[] = []
    let filledCount = 0
    let needsYouCount = 0
    let skippedCount = 0
    let formFound = false

    for (const el of controls) {
      if (!isVisible(el)) continue
      const input = el as HTMLInputElement
      const type = (input.type || el.tagName).toLowerCase()
      if (type === 'hidden' || type === 'password' || type === 'submit' || type === 'button' || type === 'image') {
        continue
      }
      if (/captcha|recaptcha|hcaptcha/i.test(input.name + input.id + (input.className || ''))) continue

      formFound = true
      const label = labelFor(el)
      const rule = matchRule(label, input.name || '', input.id || '', input.autocomplete || '')

      if (type === 'file') {
        reports.push({
          label: label || 'file',
          key: 'file',
          status: 'needs_you',
          detail: 'File upload left for you (resume attach hooks land later).'
        })
        needsYouCount++
        continue
      }

      if (type === 'checkbox' && !rule) {
        reports.push({
          label: label || 'checkbox',
          status: 'skipped',
          detail: 'Consent/terms checkbox — review yourself.'
        })
        skippedCount++
        continue
      }

      if (!rule) {
        reports.push({
          label: label || input.name || type,
          status: 'skipped',
          detail: 'No profile rule matched.'
        })
        skippedCount++
        continue
      }

      if (rule.never) {
        reports.push({ label, key: rule.key, status: 'needs_you', detail: rule.why || 'Fill yourself.' })
        needsYouCount++
        continue
      }

      if ((rule.eeo || rule.key === 'gender' || rule.key === 'veteran') && !rule.value) {
        reports.push({
          label,
          key: rule.key,
          status: 'needs_you',
          detail: 'Voluntary self-ID not set in profile — left blank.'
        })
        needsYouCount++
        continue
      }

      if (!rule.value) {
        reports.push({ label, key: rule.key, status: 'missing', detail: 'Empty in profile.' })
        needsYouCount++
        continue
      }

      try {
        if (el.tagName === 'SELECT') {
          const select = el as HTMLSelectElement
          const n = norm(rule.value)
          const opt = Array.from(select.options).find((o) => {
            const t = norm(o.text)
            return t === n || t.includes(n) || n.includes(t)
          })
          if (opt) {
            select.value = opt.value
            fire(select, 'input')
            fire(select, 'change')
            reports.push({ label, key: rule.key, status: 'filled', detail: opt.text })
            filledCount++
          } else {
            reports.push({
              label,
              key: rule.key,
              status: 'needs_you',
              detail: `No select option for "${rule.value}"`
            })
            needsYouCount++
          }
        } else if (type === 'radio') {
          const group = Array.from(
            document.querySelectorAll(`input[type="radio"][name="${CSS.escape ? CSS.escape(input.name) : input.name}"]`)
          ) as HTMLInputElement[]
          const n = norm(rule.value)
          const pick = group.find((r) => {
            const lab = norm(labelFor(r) + ' ' + (r.value || ''))
            return lab === n || lab.startsWith(n) || /^yes$/.test(n) && /^yes/.test(lab) || /^no$/.test(n) && /^no/.test(lab)
          })
          if (pick) {
            pick.click()
            reports.push({ label, key: rule.key, status: 'filled', detail: labelFor(pick) || pick.value })
            filledCount++
          } else {
            reports.push({ label, key: rule.key, status: 'needs_you', detail: 'No matching radio.' })
            needsYouCount++
          }
        } else {
          typeInto(el as HTMLInputElement | HTMLTextAreaElement, String(rule.value))
          reports.push({ label, key: rule.key, status: 'filled', detail: String(rule.value).slice(0, 80) })
          filledCount++
        }
      } catch (err) {
        reports.push({
          label,
          key: rule.key,
          status: 'needs_you',
          detail: err instanceof Error ? err.message : String(err)
        })
        needsYouCount++
      }
    }

    // Refuse to click any submitty buttons (safety audit).
    const dangerous = Array.from(document.querySelectorAll('button, input[type="submit"], a')).filter(
      (el) => isVisible(el) && SUBMITTY.test(textOf(el) || (el as HTMLInputElement).value || '')
    )
    for (const btn of dangerous.slice(0, 5)) {
      reports.push({
        label: textOf(btn) || 'submit control',
        status: 'skipped',
        detail: 'Refused to click submit/next control (apply-safety).'
      })
      skippedCount++
    }

    filling = false
    window.removeEventListener('submit', blocker, true)

    return {
      adapter: '',
      formFound,
      fields: reports,
      filledCount,
      needsYouCount,
      skippedCount
    }
  }, profilePayload)

  const result = injected as InjectedResult
  const message = result.formFound
    ? `Filled ${result.filledCount} field(s) via ${adapter}; ${result.needsYouCount} need you. Submit was not pressed.`
    : `No fillable application form found on page (${adapter}).`

  return {
    adapter,
    filledCount: result.filledCount,
    needsYouCount: result.needsYouCount,
    skippedCount: result.skippedCount,
    fields: result.fields,
    formFound: result.formFound,
    submitted: false,
    message
  }
}

function serializeProfile(profile: UserProfile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    preferredName: profile.preferredName,
    email: profile.email,
    phone: profile.phone,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    zip: profile.zip,
    location: profile.location,
    linkedin: profile.linkedin,
    github: profile.github,
    portfolio: profile.portfolio,
    website: profile.website,
    workAuthorizedUS: profile.workAuthorizedUS,
    needsSponsorship: profile.needsSponsorship,
    over18: profile.over18,
    currentEmployer: profile.currentEmployer,
    currentTitle: profile.currentTitle,
    yearsExperience: profile.yearsExperience,
    availability: profile.availability,
    noticePeriod: profile.noticePeriod,
    salaryExpectation: profile.salaryExpectation,
    willingToRelocate: profile.willingToRelocate,
    howDidYouHear: profile.howDidYouHear,
    signature: profile.signature,
    education: profile.education || {},
    eeo: profile.eeo || {}
  }
}
