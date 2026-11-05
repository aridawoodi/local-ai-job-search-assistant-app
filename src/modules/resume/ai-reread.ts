/**
 * Optional Ollama re-read of a resume after the rules-only extract.
 * Mirrors extension importer “Read again with AI”: model suggestions are kept
 * only when they appear in the resume text. EEO is never inferred.
 */

import type {
  EducationEntry,
  ProjectEntry,
  WorkHistoryEntry
} from '../../shared/profile'
import { extractJsonObject, ollamaChat } from '../ai/ollama-client'
import { inText, wordsInText } from './extract'
import type { ResumeImportPatch } from './import'

export interface AiRereadInput {
  resumeText: string
  rulesPatch: ResumeImportPatch
  ollamaUrl: string
  model?: string
}

export interface AiRereadResult {
  ok: boolean
  patch: ResumeImportPatch
  message: string
  model: string
  dropped: string[]
  usedAi: boolean
}

type AiPayload = {
  summary?: string
  skills?: string[]
  workHistory?: Array<{
    title?: string
    company?: string
    location?: string
    start?: string
    end?: string
  }>
  education?: Array<{
    school?: string
    degree?: string
    field?: string
    start?: string
    end?: string
    location?: string
    status?: string
  }>
  projects?: Array<{
    name?: string
    link?: string
    start?: string
    end?: string
    tech?: string[]
  }>
  certifications?: string[]
  languages?: string[]
}

function str(v: unknown): string {
  return (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim()
}

function grounded(value: string, text: string, share = 0): string {
  const v = str(value)
  if (!v) return ''
  if (share > 0) return wordsInText(v, text, share) ? v : ''
  return inText(v, text) ? v : ''
}

function mergeJobs(
  rules: WorkHistoryEntry[] | undefined,
  ai: AiPayload['workHistory'],
  text: string,
  dropped: string[]
): WorkHistoryEntry[] {
  const base = [...(rules || [])]
  if (!ai?.length) return base
  const out: WorkHistoryEntry[] = []
  for (const row of ai) {
    const title = grounded(row.title || '', text, 0.8)
    const company = grounded(row.company || '', text)
    const location = grounded(row.location || '', text, 0.8)
    const start = grounded(row.start || '', text)
    let end = grounded(row.end || '', text)
    if (/present|current|now|today/i.test(str(row.end)) && /\b(present|current|now|today)\b/i.test(text)) {
      end = 'Present'
    }
    if (!title && !company) {
      dropped.push(`job: ${str(row.title || row.company).slice(0, 60)}`)
      continue
    }
    if (row.company && !company) dropped.push(`employer: ${str(row.company)}`)
    out.push({
      title: title || undefined,
      company: company || undefined,
      location: location || undefined,
      start: start || undefined,
      end: end || undefined,
      current: /present/i.test(end)
    })
  }
  // Prefer AI when it found at least as many grounded jobs; else keep rules
  if (out.length >= base.length && out.length > 0) return out
  if (!base.length && out.length) return out
  return base.length ? base : out
}

function mergeEducation(
  rules: EducationEntry[] | undefined,
  ai: AiPayload['education'],
  text: string,
  dropped: string[]
): EducationEntry[] {
  const base = [...(rules || [])]
  if (!ai?.length) return base
  const out: EducationEntry[] = []
  for (const row of ai) {
    const school = grounded(row.school || '', text)
    const degree = grounded(row.degree || '', text, 0.7)
    const field = grounded(row.field || '', text, 0.8)
    const start = grounded(row.start || '', text)
    const end = grounded(row.end || '', text)
    const location = grounded(row.location || '', text, 0.8)
    const statusRaw = str(row.status).toLowerCase()
    const status = ['completed', 'in progress', 'attended'].includes(statusRaw)
      ? statusRaw
      : 'completed'
    if (!school && !degree) {
      dropped.push(`education: ${str(row.school || row.degree).slice(0, 60)}`)
      continue
    }
    out.push({
      school: school || undefined,
      degree: degree || undefined,
      field: field || undefined,
      start: start || undefined,
      end: end || undefined,
      location: location || undefined,
      status: /present/i.test(end) ? 'in progress' : status
    })
  }
  if (out.length >= base.length && out.length > 0) return out
  if (!base.length && out.length) return out
  return base.length ? base : out
}

function mergeProjects(
  rules: ProjectEntry[] | undefined,
  ai: AiPayload['projects'],
  text: string,
  dropped: string[]
): ProjectEntry[] {
  const base = [...(rules || [])]
  if (!ai?.length) return base
  const out: ProjectEntry[] = []
  for (const row of ai) {
    const name = grounded(row.name || '', text, 0.8)
    const link = grounded(row.link || '', text)
    const start = grounded(row.start || '', text)
    const end = grounded(row.end || '', text)
    const tech = (Array.isArray(row.tech) ? row.tech : [])
      .map((t) => str(t))
      .filter((t) => {
        if (!t) return false
        if (wordsInText(t, text, 0.99)) return true
        dropped.push(`tech: ${t}`)
        return false
      })
      .slice(0, 20)
    if (!name) {
      dropped.push(`project: ${str(row.name).slice(0, 60)}`)
      continue
    }
    out.push({
      name,
      link: link || undefined,
      start: start || undefined,
      end: end || undefined,
      tech
    })
  }
  if (out.length >= base.length && out.length > 0) return out
  if (!base.length && out.length) return out
  return base.length ? base : out
}

function mergeList(
  rules: string[] | undefined,
  ai: string[] | undefined,
  text: string,
  dropped: string[],
  label: string
): string[] {
  const base = [...(rules || [])]
  if (!ai?.length) return base
  const groundedList = ai
    .map((x) => str(x))
    .filter((x) => {
      if (!x) return false
      if (wordsInText(x, text, 0.8) || inText(x, text)) return true
      dropped.push(`${label}: ${x}`)
      return false
    })
  const merged = [...base]
  for (const x of groundedList) {
    if (!merged.some((y) => y.toLowerCase() === x.toLowerCase())) merged.push(x)
  }
  return merged.length ? merged : base
}

/**
 * Ask Ollama to re-read resume sections, then merge with the rules patch.
 * Only facts found in the resume text are kept. Never returns EEO fields.
 */
export async function rereadResumeWithAi(input: AiRereadInput): Promise<AiRereadResult> {
  const text = String(input.resumeText || '').trim()
  const rules = input.rulesPatch
  const dropped = [...(rules.dropped || [])]

  if (text.replace(/\s/g, '').length < 80) {
    return {
      ok: false,
      patch: rules,
      message: 'Resume text is too short for an AI re-read.',
      model: '',
      dropped,
      usedAi: false
    }
  }

  const system = [
    'You read a resume and return facts as JSON only.',
    'Copy names, titles, schools, employers, dates, and skills EXACTLY as written.',
    'Never invent or guess. Use "" or [] when something is not there.',
    'Do NOT include gender, race, disability, veteran, ethnicity, or any EEO fields.',
    'Return only JSON matching the schema.'
  ].join(' ')

  const user = [
    'RESUME TEXT:',
    text.slice(0, 12000),
    '',
    'Return JSON:',
    '{',
    '  "summary":"short professional summary if present",',
    '  "skills":["skill"],',
    '  "workHistory":[{"title":"","company":"","location":"","start":"","end":""}],',
    '  "education":[{"school":"","degree":"","field":"","start":"","end":"","location":"","status":"completed|in progress|attended"}],',
    '  "projects":[{"name":"","link":"","start":"","end":"","tech":[]}],',
    '  "certifications":["cert"],',
    '  "languages":["language"]',
    '}'
  ].join('\n')

  const chat = await ollamaChat(
    input.ollamaUrl,
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    { model: input.model, temperature: 0.1, timeoutMs: 180_000 }
  )

  if (!chat.ok) {
    return {
      ok: false,
      patch: rules,
      message: `AI re-read failed — kept rules-only extract. ${chat.message}`,
      model: chat.model,
      dropped,
      usedAi: false
    }
  }

  const ai = extractJsonObject<AiPayload>(chat.text)
  if (!ai) {
    return {
      ok: false,
      patch: rules,
      message: 'AI re-read returned unreadable JSON — kept rules-only extract.',
      model: chat.model,
      dropped,
      usedAi: false
    }
  }

  const aiDropped: string[] = []
  const summary =
    grounded(ai.summary || '', text, 0.6) || rules.summary
  if (ai.summary && !grounded(ai.summary, text, 0.6) && str(ai.summary)) {
    aiDropped.push(`summary: ${str(ai.summary).slice(0, 80)}`)
  }

  const patch: ResumeImportPatch = {
    ...rules,
    summary: summary || rules.summary,
    skills: mergeList(rules.skills, ai.skills, text, aiDropped, 'skill'),
    workHistory: mergeJobs(rules.workHistory, ai.workHistory, text, aiDropped),
    education: mergeEducation(rules.education, ai.education, text, aiDropped),
    projects: mergeProjects(rules.projects, ai.projects, text, aiDropped),
    certifications: mergeList(
      rules.certifications,
      ai.certifications,
      text,
      aiDropped,
      'cert'
    ),
    languages: mergeList(rules.languages, ai.languages, text, aiDropped, 'language'),
    dropped: [...dropped, ...aiDropped]
  }

  // Identity / links / location stay rules-only (deterministic + reliable).
  // Explicitly never copy any EEO-like keys if the model hallucinated them.
  const scrubbed = { ...patch } as ResumeImportPatch & Record<string, unknown>
  for (const k of Object.keys(scrubbed)) {
    if (/^(gender|eeo|ethnicity|veteran|disability|race|hispanic)/i.test(k)) {
      delete scrubbed[k]
    }
  }

  const bits = [
    scrubbed.workHistory?.length ? `${scrubbed.workHistory.length} jobs` : '',
    scrubbed.education?.length ? `${scrubbed.education.length} schools` : '',
    scrubbed.projects?.length ? `${scrubbed.projects.length} projects` : '',
    scrubbed.skills?.length ? `${scrubbed.skills.length} skills` : ''
  ].filter(Boolean)

  return {
    ok: true,
    patch: scrubbed,
    message: `AI re-read with ${chat.model} (facts checked against resume). Updated: ${bits.join(', ') || 'no new sections'}. EEO untouched.${
      aiDropped.length ? ` Left out ${aiDropped.length} unverified fact(s).` : ''
    }`,
    model: chat.model,
    dropped: scrubbed.dropped || [],
    usedAi: true
  }
}
