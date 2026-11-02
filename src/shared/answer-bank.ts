/**
 * Answer-bank helpers ported from extension lib/defaults.js (read-only reference).
 * Similarity merge ≥85%; NEVER_LEARN filters personal/consent/sensitive prompts.
 */

import type { AnswerBankEntry } from './profile'

const STOP = new Set(
  'a an the of to in on for and or is are you your do does did be been have has with at by this that as from we our us please any if will would can could which what'.split(
    ' '
  )
)

export const NEVER_LEARN =
  /\b(password|captcha|not a bot|social security|ssn|date of birth|birth ?date|bank|routing|credit card|pet|pets|dog|cat|hobby|hobbies|favou?rite (food|movie|color|colour|book)|spouse|wife|husband|children|kids|religio\w*|consent|i agree|agree to|acknowledge|terms|privacy|arbitrat\w*|attest\w*|certif(y|ication)|signature|e ?sign|today s date|date signed|text messages?|sms)\b/i

export function normText(s: unknown): string {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9{}]+/g, ' ')
    .trim()
}

function toks(s: string): string[] {
  return normText(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))
}

/** Jaccard / containment similarity used by extension mergeIntoBank. */
export function textSim(a: string, b: string): number {
  const A = new Set(toks(a))
  const B = new Set(toks(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  A.forEach((t) => {
    if (B.has(t)) inter++
  })
  const jacc = inter / (A.size + B.size - inter)
  const contain = inter >= 2 ? inter / Math.min(A.size, B.size) : 0
  return Math.max(jacc, contain * 0.85)
}

export function shouldLearnQuestion(q: string): boolean {
  return Boolean(q?.trim()) && !NEVER_LEARN.test(q)
}

export interface LearnedAnswer {
  q: string
  a: string
  source?: string
  site?: string
  company?: string
  url?: string
  companySpecific?: boolean
}

export interface MergeBankResult {
  bank: AnswerBankEntry[]
  added: number
  updated: number
  skipped: number
}

/** Merge learned {q,a,...} into a bank: update similar (≥0.85) instead of duplicating. */
export function mergeIntoBank(
  bank: AnswerBankEntry[],
  learned: LearnedAnswer[]
): MergeBankResult {
  const out: AnswerBankEntry[] = bank.slice()
  let added = 0
  let updated = 0
  let skipped = 0
  const now = new Date().toISOString()

  for (const e of learned) {
    if (!e || !e.q || e.a == null || String(e.a).trim() === '') {
      skipped++
      continue
    }
    if (!shouldLearnQuestion(e.q)) {
      skipped++
      continue
    }

    let i = out.findIndex((x) => x && normText(x.q) === normText(e.q))
    if (i < 0) {
      let best = -1
      let bestS = 0
      out.forEach((x, k) => {
        if (!x || !!x.companySpecific !== !!e.companySpecific) return
        const sc = textSim(x.q, e.q)
        if (sc > bestS) {
          bestS = sc
          best = k
        }
      })
      if (bestS >= 0.85) i = best
    }

    if (i >= 0) {
      if (String(out[i].a) !== String(e.a) || out[i].companySpecific !== !!e.companySpecific) {
        out[i] = {
          ...out[i],
          a: e.a,
          source: e.source || 'learned',
          companySpecific: !!e.companySpecific
        }
        updated++
      }
    } else {
      out.push({
        q: e.q,
        a: e.a,
        source: e.source || 'learned',
        companySpecific: !!e.companySpecific
      })
      added++
    }
    void now
  }

  return { bank: out, added, updated, skipped }
}

export function findAnswer(bank: AnswerBankEntry[], question: string): AnswerBankEntry | null {
  const exact = bank.find((x) => normText(x.q) === normText(question))
  if (exact) return exact
  let best: AnswerBankEntry | null = null
  let bestS = 0
  for (const x of bank) {
    const sc = textSim(x.q, question)
    if (sc > bestS) {
      bestS = sc
      best = x
    }
  }
  return bestS >= 0.85 ? best : null
}
