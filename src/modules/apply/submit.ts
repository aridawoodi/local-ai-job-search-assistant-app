/**
 * Gated submit helper. Confirm mode NEVER submits.
 * Unattended submits only when prefs.allowAutoSubmit === true.
 */

import type { Page } from 'playwright'
import type { AppPreferences } from '../../shared/preferences'
import { detectSubmitConfirmation } from './submit-detect'

export interface SubmitClickResult {
  attempted: boolean
  submitted: boolean
  message: string
  controlLabel?: string
  submitConfirmed?: boolean
  confirmDetail?: string
}

/**
 * Returns whether auto-submit is allowed for this prefs snapshot.
 * Hard rule: confirm mode never auto-submits.
 */
export function canAutoSubmit(prefs: AppPreferences): boolean {
  return prefs.applySafety === 'unattended' && prefs.allowAutoSubmit === true
}

/**
 * Click a final Submit/Apply control when gated prefs allow it.
 * Skips Next/Continue (multi-step still needs user or a later milestone).
 */
export async function maybeClickSubmit(
  page: Page,
  prefs: AppPreferences
): Promise<SubmitClickResult> {
  if (prefs.applySafety === 'confirm') {
    return {
      attempted: false,
      submitted: false,
      message: 'Confirm mode: submit requires the user (auto-submit blocked).'
    }
  }
  if (!prefs.allowAutoSubmit) {
    return {
      attempted: false,
      submitted: false,
      message: 'Unattended fill only — allowAutoSubmit is off.'
    }
  }

  const clicked = await page.evaluate(() => {
    const FINAL =
      /^(submit( application)?|apply( now)?|send application|finish|complete application)$/i
    const NEXT_ONLY = /\b(next|continue|save and continue|review)\b/i
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
      document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')
    ).filter((el) => visible(el))

    for (const el of candidates) {
      const label = textOf(el)
      if (!label || NEXT_ONLY.test(label)) continue
      if (!FINAL.test(label) && !/\bsubmit\b/i.test(label)) continue
      if (/\b(next|continue)\b/i.test(label)) continue
      ;(el as HTMLElement).click()
      return { ok: true, label }
    }
    return { ok: false, label: '' }
  })

  if (clicked.ok) {
    await new Promise((r) => setTimeout(r, 900))
    const confirm = await detectSubmitConfirmation(page)
    return {
      attempted: true,
      submitted: true,
      submitConfirmed: confirm.confirmed,
      confirmDetail: confirm.detail,
      message: confirm.confirmed
        ? `Auto-submit clicked “${clicked.label}”; confirmation seen (${confirm.detail.slice(0, 80)}).`
        : `Auto-submit clicked “${clicked.label}” (unattended + allowAutoSubmit); confirmation UI not detected yet.`,
      controlLabel: clicked.label
    }
  }

  return {
    attempted: true,
    submitted: false,
    message: 'Auto-submit enabled but no final Submit/Apply control found (Next/Continue skipped).'
  }
}
