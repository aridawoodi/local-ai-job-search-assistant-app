/**
 * Company career-site stubs: scrape user-configured listing URLs with a
 * generic job-link heuristic (Greenhouse boards, Lever, Ashby, careers pages).
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'
import type { JobListing } from '../../shared/types'

export interface CompanySearchOptions {
  urls: string[]
  fixturePath?: string
  maxResults?: number
  rateLimitMs?: number
}

export interface CompanySearchResult {
  jobs: JobListing[]
  usedFixture: boolean
  message: string
  searchUrl: string
}

interface RawCard {
  title: string
  company: string
  location: string
  url: string
  snippet: string
}

function companyJobId(url: string, title: string): string {
  return `company:${Buffer.from(`${title}|${url}`).toString('base64url').slice(0, 28)}`
}

function toListing(card: RawCard): JobListing | null {
  const title = card.title.trim()
  if (!title || !card.url) return null
  return {
    id: companyJobId(card.url, title),
    title,
    company: card.company.trim() || 'Company career site',
    location: card.location.trim() || undefined,
    url: card.url,
    source: 'company',
    snippet: card.snippet.trim() || undefined
  }
}

function guessCompanyFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const parts = u.pathname.split('/').filter(Boolean)
    if (/greenhouse\.io|lever\.co|ashbyhq\.com/.test(host) && parts[0]) {
      return parts[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    }
    return host.split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  } catch {
    return 'Company'
  }
}

async function scrapeListingPage(page: Page, pageUrl: string): Promise<RawCard[]> {
  const company = guessCompanyFromUrl(pageUrl)
  return page.evaluate((companyName) => {
    const out: { title: string; company: string; location: string; url: string; snippet: string }[] =
      []
    const seen = new Set<string>()
    const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]

    for (const a of anchors) {
      const href = a.href || ''
      const title = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
      if (!title || title.length < 3 || title.length > 140) continue
      if (/^(apply|learn more|view|see all|home|about|careers|jobs)$/i.test(title)) continue

      const looksLikeJob =
        /\/jobs?\/|\/job\/|\/position|\/opening|\/role|greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs/i.test(
          href
        ) ||
        Boolean(a.closest('[class*="opening" i], [class*="job" i], [class*="position" i], tr, li'))

      if (!looksLikeJob) continue
      if (seen.has(href) || seen.has(title.toLowerCase())) continue
      seen.add(href)
      seen.add(title.toLowerCase())

      const box = a.closest('li, tr, div, article') as HTMLElement | null
      const boxText = (box?.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)
      const location =
        boxText.find((l) =>
          /\b(remote|hybrid|on-?site|, [A-Z]{2}\b|united states|london|new york)\b/i.test(l)
        ) || ''

      out.push({
        title,
        company: companyName,
        location,
        url: href,
        snippet: boxText.slice(0, 3).join(' · ').slice(0, 200)
      })
      if (out.length >= 30) break
    }
    return out
  }, company)
}

function parseFixtureHtml(html: string): RawCard[] {
  const jobs: RawCard[] = []
  const re =
    /class="job-title"[^>]*>([^<]+)[\s\S]*?class="company"[^>]*>([^<]+)[\s\S]*?class="location"[^>]*>([^<]+)[\s\S]*?class="snippet"[^>]*>([^<]+)[\s\S]*?href="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    jobs.push({
      title: m[1].trim(),
      company: m[2].trim(),
      location: m[3].trim(),
      snippet: m[4].trim(),
      url: m[5].trim()
    })
  }
  return jobs
}

export async function searchCompanySites(
  page: Page,
  options: CompanySearchOptions
): Promise<CompanySearchResult> {
  const max = options.maxResults ?? 25
  const urls = (options.urls || []).map((u) => u.trim()).filter(Boolean)
  const searchUrl = urls[0] || ''

  if (!urls.length) {
    const fallback = loadFixture(options.fixturePath)
    if (fallback.length) {
      return {
        jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
        usedFixture: true,
        message: 'No company career URLs configured — using fixture stub listings.',
        searchUrl: 'fixture://company-careers'
      }
    }
    return {
      jobs: [],
      usedFixture: false,
      message: 'Company career sites enabled but no URLs configured in Preferences.',
      searchUrl: ''
    }
  }

  const all: RawCard[] = []
  const notes: string[] = []

  for (const url of urls.slice(0, 5)) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 1200))
      const cards = await scrapeListingPage(page, url)
      all.push(...cards)
      notes.push(`${url} → ${cards.length}`)
    } catch (err) {
      notes.push(`${url} → error (${err instanceof Error ? err.message : String(err)})`)
    }
    if (options.rateLimitMs) {
      await new Promise((r) => setTimeout(r, options.rateLimitMs))
    }
  }

  if (!all.length) {
    const fallback = loadFixture(options.fixturePath)
    if (fallback.length) {
      return {
        jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
        usedFixture: true,
        message: `Company sites returned no cards (${notes.join('; ')}). Using fixture stub.`,
        searchUrl
      }
    }
    return {
      jobs: [],
      usedFixture: false,
      message: `No company career listings parsed (${notes.join('; ')}).`,
      searchUrl
    }
  }

  const jobs = all
    .map(toListing)
    .filter((j): j is JobListing => Boolean(j))
    .slice(0, max)

  return {
    jobs,
    usedFixture: false,
    message: `Parsed ${jobs.length} company career listing(s) (${notes.join('; ')}).`,
    searchUrl
  }
}

function loadFixture(fixturePath?: string): RawCard[] {
  if (!fixturePath || !existsSync(fixturePath)) return []
  try {
    return parseFixtureHtml(readFileSync(fixturePath, 'utf8'))
  } catch {
    return []
  }
}

export function defaultCompanyFixturePath(appPath: string, cwd: string): string {
  const candidates = [
    join(appPath, 'fixtures', 'company-careers.html'),
    join(cwd, 'fixtures', 'company-careers.html'),
    join(__dirname, '../../../fixtures/company-careers.html')
  ]
  return candidates.find((p) => existsSync(p)) || candidates[0]
}
