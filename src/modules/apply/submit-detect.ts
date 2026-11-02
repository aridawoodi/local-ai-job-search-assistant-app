/**
 * Post-submit confirmation detection — especially LinkedIn Easy Apply success UI.
 */
import type { Page } from 'playwright'

export interface SubmitConfirmResult {
  confirmed: boolean
  detail: string
}

/**
 * Heuristics for "application sent" / Easy Apply done screens.
 * Safe to call after a gated submit click; never clicks anything.
 */
export async function detectSubmitConfirmation(page: Page): Promise<SubmitConfirmResult> {
  const snap = await page.evaluate(() => {
    const textOf = (el: Element | null) =>
      el ? ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : ''
    const body = (document.body?.innerText || '').slice(0, 4000)
    const lower = body.toLowerCase()

    const successSelectors = [
      '.artdeco-inline-feedback--success',
      '.jpac-modal-header',
      '[data-test-easy-apply-success]',
      '.jobs-easy-apply-content__success',
      '.post-apply-modal',
      '[data-automation-id="submissionSuccess"]',
      '.application-confirmation'
    ]
    for (const sel of successSelectors) {
      const el = document.querySelector(sel)
      if (el) {
        return { confirmed: true, detail: textOf(el).slice(0, 160) || sel }
      }
    }

    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"], .jobs-easy-apply-modal, .artdeco-modal')
    )
    for (const d of dialogs) {
      const t = textOf(d).slice(0, 400).toLowerCase()
      if (
        /application (was )?sent|your application was submitted|successfully applied|you applied|application submitted|thanks for applying|we.?ve received your application/.test(
          t
        )
      ) {
        return { confirmed: true, detail: textOf(d).slice(0, 160) }
      }
    }

    if (
      /application (was )?sent|your application was submitted|successfully applied|application submitted|thanks for applying/.test(
        lower
      )
    ) {
      return { confirmed: true, detail: 'Page text indicates application submitted.' }
    }

    // Practice fixture: alert-driven or data attribute after click.
    if (document.documentElement.getAttribute('data-submit-ok') === '1') {
      return { confirmed: true, detail: 'Fixture submit confirmation flag set.' }
    }

    return { confirmed: false, detail: '' }
  })

  return {
    confirmed: snap.confirmed,
    detail: snap.detail || (snap.confirmed ? 'Submit confirmation detected.' : 'No confirmation UI found.')
  }
}
