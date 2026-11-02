/**
 * Refine / polish long answers with local Ollama — desktop parity for extension refine toolbar.
 */

import type { UserProfile } from '../../shared/profile'
import { ollamaChat } from './ollama-client'
import { factCheckText } from './facts'

export type RefineMode = 'polish' | 'shorter' | 'longer' | 'more_specific'

export interface RefineResult {
  ok: boolean
  text: string
  blocked: string[]
  warnings: string[]
  model: string
  message: string
}

const MODE_INSTR: Record<RefineMode, string> = {
  polish: 'Polish grammar and clarity; keep the same meaning and length.',
  shorter: 'Make it more concise (about 30% shorter) without dropping key facts.',
  longer: 'Expand slightly with more concrete detail from the resume facts only.',
  more_specific: 'Replace vague phrases with specific facts from the resume when available.'
}

export async function refineAnswer(opts: {
  ollamaUrl: string
  model?: string
  profile: UserProfile
  text: string
  mode?: RefineMode
  question?: string
  jobDescription?: string
}): Promise<RefineResult> {
  const original = String(opts.text || '').trim()
  if (!original) {
    return {
      ok: false,
      text: '',
      blocked: [],
      warnings: [],
      model: '',
      message: 'Nothing to refine.'
    }
  }

  const resume =
    opts.profile.resumeText ||
    [opts.profile.summary, ...(opts.profile.skills || [])].filter(Boolean).join('\n')

  const mode = opts.mode || 'polish'
  const system =
    'You refine a job-application answer. ' +
    MODE_INSTR[mode] +
    ' Use ONLY facts supported by the resume/profile. Never invent numbers, employers, degrees or tools. ' +
    'Return plain text only — the improved answer, no preamble.'

  const user = [
    opts.question ? `Question: ${opts.question}` : '',
    opts.jobDescription
      ? `Job context:\n${String(opts.jobDescription).slice(0, 2000)}`
      : '',
    resume ? `Resume facts:\n${resume.slice(0, 4000)}` : '',
    `Current answer:\n${original}`
  ]
    .filter(Boolean)
    .join('\n\n')

  const chat = await ollamaChat(
    opts.ollamaUrl,
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { model: opts.model, temperature: 0.25 }
  )

  if (!chat.ok) {
    return {
      ok: false,
      text: original,
      blocked: [],
      warnings: [],
      model: chat.model,
      message: chat.message
    }
  }

  const text = chat.text.trim() || original
  const check = factCheckText(text, `${resume}\n${original}`, opts.jobDescription)

  return {
    ok: check.ok,
    text,
    blocked: check.blocked,
    warnings: check.warnings,
    model: chat.model,
    message: check.ok
      ? `Refined (${mode}).`
      : `Refined with ${check.blocked.length} fact-check flag(s) — review carefully.`
  }
}
