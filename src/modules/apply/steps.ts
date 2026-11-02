/**
 * Multi-step application sessions — advance Next/Continue after fill,
 * re-fill each step, then optionally click final Submit when gated prefs allow.
 *
 * Confirm mode may advance Next only when allowAdvanceSteps is on (still never submits).
 * Unattended may advance + submit per allowAdvanceSteps / allowAutoSubmit.
 */
import type { Page } from 'playwright'
import type { AppPreferences } from '../../shared/preferences'
import type { ApplyFieldReport } from '../../shared/types'
import { fillApplicationPage, type FillPageResult } from './fill'
import { canAutoSubmit, maybeClickSubmit } from './submit'
import type { UserProfile } from '../../shared/profile'

export const DEFAULT_MAX_STEPS = 6

export interface StepSessionResult {
  stepsAdvanced: number
  fills: FillPageResult[]
  fields: ApplyFieldReport[]
  filledCount: number
  needsYouCount: number
  submitted: boolean
  submitConfirmed?: boolean
  submitLabel?: string
  message: string
  adapter: string
  formFound: boolean
}

export function canAdvanceSteps(prefs: AppPreferences): boolean {
  return prefs.allowAdvanceSteps === true
}

/**
 * Click a Next / Continue control (not final Submit/Apply).
 * Returns label when clicked.
 */
export async function clickNextOrContinue(page: Page): Promise<{
  clicked: boolean
  label: string
}> {
  return page.evaluate(() => {
    const NEXT =
      /^(next|continue|save and continue|review|review application|save & continue)$/i
    const FINAL =
      /\b(submit( application)?|apply( now)?|send application|finish|complete application)\b/i
    const textOf = (el: Element) =>
      ((el as HTMLElement).innerText ||
        (el as HTMLInputElement).value ||
        el.textContent ||
        '')
        .replace(/\s+/g, ' ')
        .trim()
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getClientRects?.()
      return !!(r && r.length)
    }

    const candidates = Array.from(
      document.querySelectorAll(
        'button, input[type="submit"], input[type="button"], a[role="button"], [data-easy-apply-next-button], [data-test-modal-primary-btn], [data-automation-id="bottom-navigation-next-button"], [data-automation-id="pageFooterNextButton"]'
      )
    ).filter((el) => visible(el))

    for (const el of candidates) {
      const label = textOf(el)
      if (!label) continue
      if (FINAL.test(label) && !NEXT.test(label)) continue
      if (!NEXT.test(label) && !/next|continue/i.test(label)) continue
      ;(el as HTMLElement).click()
      return { clicked: true, label }
    }
    return { clicked: false, label: '' }
  })
}

/**
 * LinkedIn Easy Apply: open the modal if a visible Easy Apply button exists.
 */
export async function ensureEasyApplyModal(page: Page): Promise<{
  opened: boolean
  message: string
}> {
  const state = await page.evaluate(() => {
    const textOf = (el: Element | null) =>
      el ? ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : ''
    const hasModal = Boolean(
      document.querySelector('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]') ||
        Array.from(document.querySelectorAll('[role="dialog"]')).find((d) =>
          /apply to|easy apply/i.test(textOf(d).slice(0, 200))
        )
    )
    if (hasModal) return { hasModal: true, clicked: false }

    const btns = Array.from(
      document.querySelectorAll(
        'button, [role="button"], .jobs-apply-button, .jobs-s-apply button'
      )
    )
    for (const b of btns) {
      const t = textOf(b)
      if (/^easy apply$/i.test(t) || /\beasy apply\b/i.test(t)) {
        ;(b as HTMLElement).click()
        return { hasModal: false, clicked: true }
      }
    }
    return { hasModal: false, clicked: false }
  })

  if (state.hasModal) return { opened: true, message: 'Easy Apply modal already open.' }
  if (state.clicked) {
    await new Promise((r) => setTimeout(r, 900))
    const nowOpen = await page.evaluate(() => {
      const textOf = (el: Element | null) =>
        el ? ((el as HTMLElement).innerText || el.textContent || '') : ''
      return Boolean(
        document.querySelector('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]') ||
          Array.from(document.querySelectorAll('[role="dialog"]')).find((d) =>
            /apply to|easy apply/i.test(textOf(d).slice(0, 200))
          )
      )
    })
    return {
      opened: nowOpen,
      message: nowOpen
        ? 'Opened Easy Apply modal.'
        : 'Clicked Easy Apply but modal did not appear (login/gate?).'
    }
  }
  return { opened: false, message: 'No Easy Apply button or modal found.' }
}

/**
 * Fill current page, then loop Next/Continue + re-fill up to maxSteps.
 * Final Submit only when canAutoSubmit(prefs).
 */
export async function runMultiStepSession(
  page: Page,
  profile: UserProfile,
  prefs: AppPreferences,
  options?: { maxSteps?: number }
): Promise<StepSessionResult> {
  const maxSteps = options?.maxSteps ?? prefs.maxFormSteps ?? DEFAULT_MAX_STEPS
  const fills: FillPageResult[] = []
  let stepsAdvanced = 0
  let submitted = false

  // LinkedIn: try to open Easy Apply first.
  const url = page.url()
  if (/linkedin\.com/i.test(url)) {
    await ensureEasyApplyModal(page)
  }

  let fill = await fillApplicationPage(page, profile)
  fills.push(fill)

  const advance = canAdvanceSteps(prefs)
  if (advance && fill.formFound) {
    for (let i = 0; i < maxSteps - 1; i++) {
      const next = await clickNextOrContinue(page)
      if (!next.clicked) break
      stepsAdvanced++
      await new Promise((r) => setTimeout(r, 700))
      fill = await fillApplicationPage(page, profile)
      fills.push(fill)
      if (!fill.formFound) break
    }
  }

  let submitConfirmed = false
  let submitLabel: string | undefined
  if (fill.formFound && canAutoSubmit(prefs)) {
    const sub = await maybeClickSubmit(page, prefs)
    submitted = sub.submitted
    submitConfirmed = Boolean(sub.submitConfirmed)
    submitLabel = sub.controlLabel
  }

  const fields = fills.flatMap((f) => f.fields)
  const filledCount = fills.reduce((n, f) => n + f.filledCount, 0)
  const needsYouCount = fills.reduce((n, f) => n + f.needsYouCount, 0)
  const adapter = fills[0]?.adapter || 'Generic'
  const formFound = fills.some((f) => f.formFound)

  const parts = [
    `Multi-step: ${fills.length} fill pass(es)`,
    stepsAdvanced ? `${stepsAdvanced} Next/Continue` : advance ? 'no Next found' : 'step advance off',
    `filled ${filledCount}`,
    `${needsYouCount} need you`,
    submitted
      ? submitConfirmed
        ? 'submitted + confirmation UI'
        : 'submitted (confirmation not seen)'
      : 'submit not pressed'
  ]

  return {
    stepsAdvanced,
    fills,
    fields,
    filledCount,
    needsYouCount,
    submitted,
    submitConfirmed,
    submitLabel,
    adapter,
    formFound,
    message: parts.join('; ') + '.'
  }
}
