/**
 * Company career-site crawl: Greenhouse / Lever / Ashby specific selectors
 * plus a generic job-link heuristic for other careers pages.
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
  return page.evaluate(
    ({ companyName, pageUrl: originUrl }) => {
      const out: {
        title: string
        company: string
        location: string
        url: string
        snippet: string
      }[] = []
      const seen = new Set<string>()

      const push = (title: string, href: string, location: string, snippet: string) => {
        const t = title.replace(/\s+/g, ' ').trim()
        if (!t || t.length < 3 || t.length > 160) return
        if (/^(apply|learn more|view|see all|home|about|careers|jobs|back)$/i.test(t)) return
        if (!href || seen.has(href) || seen.has(t.toLowerCase())) return
        seen.add(href)
        seen.add(t.toLowerCase())
        out.push({
          title: t,
          company: companyName,
          location: location.trim(),
          url: href,
          snippet: snippet.slice(0, 200)
        })
      }

      // Greenhouse board
      document.querySelectorAll('div.opening a, section#jobs div.opening a, a[href*="/jobs/"]').forEach((el) => {
        const a = el as HTMLAnchorElement
        if (!/greenhouse\.io|\/jobs\//i.test(a.href) && !a.closest('div.opening')) return
        const loc =
          (a.parentElement?.querySelector('.location') as HTMLElement | null)?.innerText ||
          (a.closest('div.opening')?.querySelector('.location') as HTMLElement | null)?.innerText ||
          ''
        push(a.innerText || a.getAttribute('aria-label') || '', a.href, loc, loc)
      })

      // Lever
      document
        .querySelectorAll(
          '.posting a.posting-title, .posting a[href*="/"], a.posting-btn-submit, div.posting'
        )
        .forEach((el) => {
          const root = el.closest('.posting') || el
          const a =
            (root.querySelector('a.posting-title, a[href]') as HTMLAnchorElement | null) ||
            (el as HTMLAnchorElement)
          if (!a?.href || !/lever\.co/i.test(a.href + originUrl)) return
          const title =
            (root.querySelector('h5, a.posting-title') as HTMLElement | null)?.innerText ||
            a.innerText
          const loc =
            (root.querySelector('.sort-by-location, .posting-categories, span.location') as HTMLElement | null)
              ?.innerText || ''
          push(title, a.href, loc, loc)
        })

      // Ashby
      document
        .querySelectorAll(
          'a[href*="ashbyhq.com"], a[href*="/api/"], div[class*="ashby"], a[class*="job"]'
        )
        .forEach((el) => {
          const a = (el.closest('a') || el) as HTMLAnchorElement
          if (!a?.href) return
          if (!/ashbyhq\.com|\/jobs\//i.test(a.href + originUrl) && !a.closest('[class*="ashby" i]'))
            return
          const title = (a.innerText || a.getAttribute('aria-label') || '').trim()
          const box = a.closest('div, li, article') as HTMLElement | null
          const loc =
            box?.innerText
              ?.split('\n')
              .map((l) => l.trim())
              .find((l) => /\b(remote|hybrid|, [A-Z]{2}\b)/i.test(l)) || ''
          push(title, a.href, loc, loc)
        })

      // Generic fallback
      if (out.length < 3) {
        const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]
        for (const a of anchors) {
          const href = a.href || ''
          const title = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
          const looksLikeJob =
            /\/jobs?\/|\/job\/|\/position|\/opening|\/role|greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs/i.test(
              href
            ) ||
            Boolean(
              a.closest('[class*="opening" i], [class*="job" i], [class*="position" i], [class*="posting" i], tr, li')
            )
          if (!looksLikeJob) continue
          const box = a.closest('li, tr, div, article') as HTMLElement | null
          const boxText = (box?.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)
          const location =
            boxText.find((l) =>
              /\b(remote|hybrid|on-?site|, [A-Z]{2}\b|united states|london|new york)\b/i.test(l)
            ) || ''
          push(title, href, location, boxText.slice(0, 3).join(' · '))
          if (out.length >= 40) break
        }
      }

      return out
    },
    { companyName: company, pageUrl }
  )
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

  for (const url of urls.slice(0, 8)) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 1400))
      // Some boards lazy-load openings after hydration
      await page
        .waitForSelector(
          'div.opening, .posting, a[href*="/jobs/"], a.posting-title, [class*="job" i]',
          { timeout: 8_000 }
        )
        .catch(() => null)
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

  // Dedupe by URL before slice
  const seen = new Set<string>()
  const deduped: RawCard[] = []
  for (const card of all) {
    if (seen.has(card.url)) continue
    seen.add(card.url)
    deduped.push(card)
  }

  const jobs = deduped
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
