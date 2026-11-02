/**
 * Cover letter draft + fact check — ported patterns from extension lib/cover.js.
 */

import type { UserProfile } from '../../shared/profile'
import { extractJsonObject, ollamaChat, type ChatMessage } from './ollama-client'
import { factCheckText } from './facts'

export type CoverLength = 'short' | 'standard' | 'long'

const LENGTHS: Record<CoverLength, string> = {
  short: 'about 180 words, 3 short paragraphs',
  standard: 'about 280 words, 4 paragraphs',
  long: 'about 380 words, 4-5 paragraphs'
}

export interface CoverResult {
  ok: boolean
  text: string
  greeting: string
  paragraphs: string[]
  closing: string
  blocked: string[]
  warnings: string[]
  words: number
  model: string
  message: string
}

function buildMessages(
  profile: UserProfile,
  job: { title?: string; company?: string; description?: string },
  length: CoverLength,
  extra?: string
): ChatMessage[] {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const resumeText =
    profile.resumeText ||
    [profile.summary, `Skills: ${(profile.skills || []).join(', ')}`].filter(Boolean).join('\n')

  const system =
    `You write a cover letter for the candidate, in first person, in their own voice. Length: ${LENGTHS[length]}. ` +
    "Use ONLY facts from the resume text: employers, titles, dates, numbers, tools and skills must appear in it. Never invent experience. " +
    "If the job asks for something the resume does not show, do not claim it. " +
    'Plain and specific; no clichés like "I am writing to express my interest". ' +
    'Do not include addresses, the date, phone, email or a signature block. ' +
    'Return JSON only: {"greeting":"Dear … ,","paragraphs":["…","…"],"closing":"Sincerely,"}.'

  const user = [
    `Job: ${job.title || '?'} at ${job.company || '?'}`,
    job.description ? `Job description:\n${String(job.description).slice(0, 5000)}` : '',
    `Resume text:\n${String(resumeText).slice(0, 7000)}`,
    profile.toneNotes ? `Tone notes: ${profile.toneNotes.slice(0, 400)}` : '',
    profile.writingSamples
      ? `Writing samples (voice only):\n${profile.writingSamples.slice(0, 1500)}`
      : '',
    extra ? `Extra instruction: ${extra.slice(0, 400)}` : '',
    name ? `Candidate name (for closing only, do not invent): ${name}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

export function coverToText(
  data: { greeting?: string; paragraphs?: string[]; closing?: string } | string,
  name?: string
): string {
  if (!data) return ''
  if (typeof data === 'string') return data.trim()
  const paras = (Array.isArray(data.paragraphs) ? data.paragraphs : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  const greeting = String(data.greeting || 'Dear Hiring Team,').trim()
  const closing = String(data.closing || 'Sincerely,').trim()
  return [greeting, ...paras, closing + (name ? `\n${name}` : '')].join('\n\n')
}

export async function draftCoverLetter(opts: {
  ollamaUrl: string
  model?: string
  profile: UserProfile
  job: { title?: string; company?: string; description?: string }
  length?: CoverLength
  extra?: string
}): Promise<CoverResult> {
  const resumeText =
    opts.profile.resumeText ||
    [opts.profile.summary, ...(opts.profile.skills || [])].filter(Boolean).join('\n')
  if (!resumeText.trim()) {
    return {
      ok: false,
      text: '',
      greeting: '',
      paragraphs: [],
      closing: '',
      blocked: [],
      warnings: [],
      words: 0,
      model: '',
      message: 'No resume text — import a resume first.'
    }
  }

  const chat = await ollamaChat(
    opts.ollamaUrl,
    buildMessages(opts.profile, opts.job, opts.length || 'standard', opts.extra),
    { model: opts.model, temperature: 0.35 }
  )
  if (!chat.ok) {
    return {
      ok: false,
      text: '',
      greeting: '',
      paragraphs: [],
      closing: '',
      blocked: [],
      warnings: [],
      words: 0,
      model: chat.model,
      message: chat.message
    }
  }

  const parsed = extractJsonObject<{
    greeting?: string
    paragraphs?: string[]
    closing?: string
  }>(chat.text)

  const name = [opts.profile.firstName, opts.profile.lastName].filter(Boolean).join(' ')
  const greeting = String(parsed?.greeting || 'Dear Hiring Team,').trim()
  const paragraphs = Array.isArray(parsed?.paragraphs)
    ? parsed!.paragraphs!.map((p) => String(p).trim()).filter(Boolean)
    : []
  const closing = String(parsed?.closing || 'Sincerely,').trim()
  const text =
    paragraphs.length > 0
      ? coverToText({ greeting, paragraphs, closing }, name)
      : coverToText(chat.text, name)

  const check = factCheckText(text, resumeText, opts.job.description)
  const words = text.split(/\s+/).filter(Boolean).length

  return {
    ok: check.ok,
    text,
    greeting,
    paragraphs,
    closing,
    blocked: check.blocked,
    warnings: check.warnings,
    words,
    model: chat.model,
    message: check.ok
      ? `Draft ready (~${words} words).`
      : `Fact check found ${check.blocked.length} issue(s) — edit before using.`
  }
}
