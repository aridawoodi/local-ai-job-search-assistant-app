/**
 * Resume tailor flow — prompt + fact-checked rewrite of summary / skills lines.
 * Inspired by extension lib/tailor.js (desktop works on resumeText, not block ids).
 */

import type { UserProfile } from '../../shared/profile'
import { extractJsonObject, ollamaChat, type ChatMessage } from './ollama-client'
import { factCheckText } from './facts'

export interface TailorJobContext {
  title?: string
  company?: string
  description?: string
}

export interface TailorResult {
  ok: boolean
  summary: string
  skillsLine: string
  notes: string[]
  blocked: string[]
  warnings: string[]
  model: string
  message: string
  tailoredText: string
}

function buildMessages(
  profile: UserProfile,
  job: TailorJobContext,
  rules: string[]
): ChatMessage[] {
  const resume =
    profile.resumeText ||
    [
      profile.summary,
      `Skills: ${(profile.skills || []).join(', ')}`,
      ...(profile.workHistory || []).map(
        (j) =>
          `${j.title || ''} @ ${j.company || ''} (${j.start || ''}–${j.end || j.current ? 'Present' : ''})\n${(j.bullets || []).map((b) => `• ${b}`).join('\n')}`
      )
    ]
      .filter(Boolean)
      .join('\n\n')

  const ruleTxt = (rules || []).filter(Boolean).map((r, i) => `${i + 1}. ${r}`).join('\n')
  const system = [
    'You tailor a resume summary and skills line to a job posting.',
    'NEVER invent employers, titles, dates, degrees, numbers, metrics, tools or achievements not already in the resume text.',
    'Keep roughly the same length. Return JSON only:',
    '{"summary":"...","skills":"...","notes":["short reason"]}'
  ].join(' ')

  const user = [
    `JOB: ${job.title || ''} at ${job.company || ''}`,
    'JOB DESCRIPTION:',
    String(job.description || '').slice(0, 3500),
    ruleTxt ? `\nCANDIDATE RULES:\n${ruleTxt}` : '',
    '\nRESUME TEXT:',
    resume.slice(0, 7000)
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

export async function tailorResume(opts: {
  ollamaUrl: string
  model?: string
  profile: UserProfile
  job: TailorJobContext
  rules?: string[]
}): Promise<TailorResult> {
  const resumeCorpus =
    opts.profile.resumeText ||
    [opts.profile.summary, ...(opts.profile.skills || []), opts.profile.currentTitle]
      .filter(Boolean)
      .join('\n')

  if (!resumeCorpus.trim()) {
    return {
      ok: false,
      summary: '',
      skillsLine: '',
      notes: [],
      blocked: [],
      warnings: [],
      model: '',
      message: 'No resume text in profile — import a PDF/DOCX or paste resume text first.',
      tailoredText: ''
    }
  }

  const chat = await ollamaChat(
    opts.ollamaUrl,
    buildMessages(opts.profile, opts.job, opts.rules || []),
    { model: opts.model, temperature: 0.2 }
  )
  if (!chat.ok) {
    return {
      ok: false,
      summary: '',
      skillsLine: '',
      notes: [],
      blocked: [],
      warnings: [],
      model: chat.model,
      message: chat.message,
      tailoredText: ''
    }
  }

  const parsed = extractJsonObject<{
    summary?: string
    skills?: string
    notes?: string[]
  }>(chat.text)

  const summary = String(parsed?.summary || '').trim() || opts.profile.summary
  const skillsLine =
    String(parsed?.skills || '').trim() || (opts.profile.skills || []).join(', ')
  const notes = Array.isArray(parsed?.notes) ? parsed!.notes!.map(String) : []

  const check = factCheckText(
    `${summary}\n${skillsLine}`,
    resumeCorpus,
    opts.job.description
  )

  const tailoredText = [
    summary,
    '',
    `Skills: ${skillsLine}`,
    '',
    ...(opts.profile.workHistory || []).map(
      (j) =>
        `${j.title || ''} — ${j.company || ''}\n${(j.bullets || []).map((b) => `• ${b}`).join('\n')}`
    )
  ].join('\n')

  return {
    ok: check.ok,
    summary,
    skillsLine,
    notes,
    blocked: check.blocked,
    warnings: check.warnings,
    model: chat.model,
    message: check.ok
      ? 'Tailored summary/skills (fact-checked). Work history left unchanged.'
      : `Fact check blocked ${check.blocked.length} claim(s) — review before using.`,
    tailoredText
  }
}
