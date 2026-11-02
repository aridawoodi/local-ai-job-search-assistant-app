/**
 * LinkedIn job search UI via Playwright (no LinkedIn API).
 * Requires a logged-in session for reliable results; falls back to fixture.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'
import type { JobListing } from '../../shared/types'

export interface LinkedInSearchOptions {
  query: string
  location: string
  fixturePath?: string
  maxResults?: number
}

export interface LinkedInSearchResult {
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
  jobId: string
}

function linkedInJobId(url: string, jobId: string): string {
  if (jobId) return `linkedin:${jobId}`
  const m = url.match(/\/jobs\/view\/(\d+)/) || url.match(/currentJobId=(\d+)/)
  if (m) return `linkedin:${m[1]}`
  return `linkedin:${Buffer.from(url).toString('base64url').slice(0, 24)}`
}

function toListing(card: RawCard): JobListing | null {
  const title = card.title.trim()
  if (!title) return null
  let url = card.url || ''
  if (url.startsWith('/')) url = `https://www.linkedin.com${url}`
  if (!url) return null
  return {
    id: linkedInJobId(url, card.jobId),
    title,
    company: card.company.trim() || 'Unknown company',
    location: card.location.trim() || undefined,
    url: url.split('?')[0],
    source: 'linkedin',
    snippet: card.snippet.trim() || undefined
  }
}

async function scrapeCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const out: RawCard[] = []
    const seen = new Set<string>()
    const cards = Array.from(
      document.querySelectorAll(
        'li.jobs-search-results__list-item, div.job-card-container, li.scaffold-layout__list-item, div.base-card, div[data-job-id]'
      )
    )

    for (const card of cards) {
      const root = card as HTMLElement
      const jobId =
        root.getAttribute('data-job-id') ||
        root.getAttribute('data-occludable-job-id') ||
        root.querySelector('[data-job-id]')?.getAttribute('data-job-id') ||
        ''

      const titleEl = root.querySelector(
        'a.job-card-list__title, a.job-card-container__link, a.base-card__full-link, a[href*="/jobs/view/"]'
      ) as HTMLAnchorElement | null

      const title =
        titleEl?.innerText?.trim() ||
        (root.querySelector('.job-card-list__title, .artdeco-entity-lockup__title') as HTMLElement | null)
          ?.innerText?.trim() ||
        ''

      let href = titleEl?.href || ''
      if (!href && jobId) href = `https://www.linkedin.com/jobs/view/${jobId}`

      const company =
        (
          root.querySelector(
            '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, h4'
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const location =
        (
          root.querySelector(
            '.job-card-container__metadata-item, .job-search-card__location, .artdeco-entity-lockup__caption'
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const snippet =
        (
          root.querySelector('.job-card-container__footer-item, .job-search-card__snippet') as
            | HTMLElement
            | null
        )?.innerText?.trim() || ''

      const key = jobId || href || title
      if (!title || seen.has(key)) continue
      seen.add(key)
      out.push({ title, company, location, url: href, snippet, jobId })
    }
    return out
  })
}

async function pageNeedsLogin(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const href = location.href
    const text = (document.body?.innerText || '').toLowerCase()
    if (/\/login|\/uas\/login|\/checkpoint\//.test(href)) return true
    if (document.querySelector('input#username, input[name="session_key"]')) return true
    if (/sign in to continue|join linkedin|welcome back/.test(text) && /sign in|join now/.test(text)) {
      return true
    }
    return false
  })
}

function parseFixtureHtml(html: string): RawCard[] {
  const jobs: RawCard[] = []
  const re =
    /data-job-id="([^"]+)"[\s\S]*?class="job-title"[^>]*>([^<]+)[\s\S]*?class="company"[^>]*>([^<]+)[\s\S]*?class="location"[^>]*>([^<]+)[\s\S]*?class="snippet"[^>]*>([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    jobs.push({
      jobId: m[1],
      title: m[2].trim(),
      company: m[3].trim(),
      location: m[4].trim(),
      snippet: m[5].trim(),
      url: `https://www.linkedin.com/jobs/view/${m[1]}`
    })
  }
  return jobs
}

export async function searchLinkedIn(
  page: Page,
  options: LinkedInSearchOptions
): Promise<LinkedInSearchResult> {
  const max = options.maxResults ?? 20
  const q = encodeURIComponent(options.query)
  const l = encodeURIComponent(options.location)
  const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l}`

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await new Promise((r) => setTimeout(r, 1800))

    if (await pageNeedsLogin(page)) {
      const fallback = loadFixture(options.fixturePath)
      if (fallback.length) {
        return {
          jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
          usedFixture: true,
          message:
            'LinkedIn needs login. Sign in in the automation browser, or using fixture results for this run.',
          searchUrl
        }
      }
      return {
        jobs: [],
        usedFixture: false,
        message: 'LinkedIn needs a manual login — sign in, then Run search again.',
        searchUrl
      }
    }

    let raw = await scrapeCards(page)
    if (raw.length === 0) {
      await new Promise((r) => setTimeout(r, 2000))
      raw = await scrapeCards(page)
    }

    if (raw.length === 0) {
      const fallback = loadFixture(options.fixturePath)
      if (fallback.length) {
        return {
          jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
          usedFixture: true,
          message:
            'LinkedIn returned no parseable cards (auth wall or layout). Using local fixture for demo.',
          searchUrl
        }
      }
      return {
        jobs: [],
        usedFixture: false,
        message: 'No LinkedIn job cards parsed. Log in or try a different query.',
        searchUrl
      }
    }

    const jobs = raw
      .map(toListing)
      .filter((j): j is JobListing => Boolean(j))
      .slice(0, max)

    return {
      jobs,
      usedFixture: false,
      message: `Parsed ${jobs.length} LinkedIn job card(s) from live search.`,
      searchUrl
    }
  } catch (err) {
    const fallback = loadFixture(options.fixturePath)
    if (fallback.length) {
      return {
        jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
        usedFixture: true,
        message: `LinkedIn navigation failed (${err instanceof Error ? err.message : String(err)}). Using fixture.`,
        searchUrl
      }
    }
    throw err
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

export function defaultLinkedInFixturePath(appPath: string, cwd: string): string {
  const candidates = [
    join(appPath, 'fixtures', 'linkedin-results.html'),
    join(cwd, 'fixtures', 'linkedin-results.html'),
    join(__dirname, '../../../fixtures/linkedin-results.html')
  ]
  return candidates.find((p) => existsSync(p)) || candidates[0]
}
