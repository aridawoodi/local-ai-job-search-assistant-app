/** Lightweight fact-check helpers inspired by extension lib/tailor.js + lib/guard.js. */

const COMMON = new Set(
  'a an and the of to in on for with by at from as or is are was were be been into across using use used via per over under within our your their its it this that these those i we he she they new dear hiring team manager sincerely regards best thank thanks you my'.split(
    ' '
  )
)

export function numbersIn(s: string): string[] {
  return (String(s || '').match(/\$?\d[\d,.]*\s?(?:%|k|m|x|\+)?/gi) || []).map((n) =>
    n.replace(/[,\s]/g, '').replace(/\.$/, '').toLowerCase()
  )
}

export function tokens(s: string): string[] {
  return String(s || '').match(/[A-Za-z][A-Za-z0-9+#.&/-]*[A-Za-z0-9+#]|[A-Za-z]/g) || []
}

/**
 * Flag numbers / technical / proper-noun terms in `after` that are not present in `allowed` corpus.
 */
export function newFacts(after: string, allowedCorpus: string): string[] {
  const M = String(allowedCorpus || '').toLowerCase()
  const issues: string[] = []
  for (const n of numbersIn(after)) {
    const bare = n.replace(/[$%kmx+]/g, '')
    if (!bare) continue
    if (!M.includes(bare)) issues.push(`new number “${n}”`)
  }
  const words = String(after).split(/(?<=[.!?:;])\s+|\s+/)
  let sentenceStart = true
  for (const w0 of words) {
    const w = w0.replace(/^[("'“‘[]+|[)"'”’\],.;:!?]+$/g, '')
    const start = sentenceStart
    sentenceStart = /[.!?:;]$/.test(w0)
    if (!w || /^\d/.test(w)) continue
    const technical =
      /[A-Z].*[A-Z]|[0-9+#]|\.[a-z]/.test(w.slice(1)) || /^[A-Z]{2,}/.test(w)
    const proper = /^[A-Z]/.test(w) && !start
    if (!(technical || proper)) continue
    if (COMMON.has(w.toLowerCase())) continue
    const lc = w.toLowerCase()
    if (!M.includes(lc) && !M.includes(lc.replace(/s$/, ''))) {
      issues.push(`“${w}” is not in your resume`)
    }
  }
  return Array.from(new Set(issues))
}

export function factCheckText(
  text: string,
  resumeText: string,
  jd?: string
): { ok: boolean; blocked: string[]; warnings: string[] } {
  const issues = newFacts(text, resumeText)
  const JD = String(jd || '').toLowerCase()
  const blocked: string[] = []
  const warnings: string[] = []
  for (const m of issues) {
    const term = (m.match(/“([^”]+)”/) || [])[1] || ''
    const isNum = /^new number/.test(m)
    if (!term) continue
    const inJd = JD.includes(term.toLowerCase())
    if (isNum) blocked.push(`number “${term}” isn't in your resume`)
    else if (inJd)
      warnings.push(
        `“${term}” comes from the job description: make sure you don't claim experience you don't have`
      )
    else blocked.push(`“${term}” isn't in your resume or the job`)
  }
  return {
    ok: !blocked.length,
    blocked: Array.from(new Set(blocked)),
    warnings: Array.from(new Set(warnings))
  }
}
