/**
 * LinkedIn job search UI via Playwright (no LinkedIn API).
 * Requires a logged-in session for reliable results; falls back to fixture.
 * Hardened: guest collection selectors, scroll-load, retry waits.
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
        [
          'li.jobs-search-results__list-item',
          'div.job-card-container',
          'li.scaffold-layout__list-item',
          'div.base-card',
          'div.base-card--link',
          'div[data-job-id]',
          'li.jobs-search-two-pane__job-card-container--viewport-tracking-0',
          'ul.jobs-search__results-list > li',
          'div.job-search-card',
          'li.ember-view.jobs-search-results__list-item'
        ].join(', ')
      )
    )

    for (const card of cards) {
      const root = card as HTMLElement
      const jobId =
        root.getAttribute('data-job-id') ||
        root.getAttribute('data-occludable-job-id') ||
        root.getAttribute('data-entity-urn')?.replace(/^.*:/, '') ||
        root.querySelector('[data-job-id]')?.getAttribute('data-job-id') ||
        ''

      const titleEl = root.querySelector(
        [
          'a.job-card-list__title',
          'a.job-card-list__title--link',
          'a.job-card-container__link',
          'a.base-card__full-link',
          'a.base-card--link',
          'a[href*="/jobs/view/"]',
          'h3.base-search-card__title a',
          'h3.base-search-card__title',
          '.artdeco-entity-lockup__title a'
        ].join(', ')
      ) as HTMLAnchorElement | HTMLElement | null

      const title =
        (titleEl as HTMLElement)?.innerText?.trim() ||
        titleEl?.textContent?.trim() ||
        (root.querySelector('.job-card-list__title, .artdeco-entity-lockup__title, .base-search-card__title') as HTMLElement | null)
          ?.innerText?.trim() ||
        ''

      let href =
        (titleEl as HTMLAnchorElement)?.href ||
        (root.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null)?.href ||
        ''
      if (!href && jobId) href = `https://www.linkedin.com/jobs/view/${jobId}`

      const company =
        (
          root.querySelector(
            [
              '.job-card-container__primary-description',
              '.artdeco-entity-lockup__subtitle',
              '.base-search-card__subtitle',
              'h4.base-search-card__subtitle',
              'a.hidden-nested-link',
              'h4'
            ].join(', ')
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const location =
        (
          root.querySelector(
            [
              '.job-card-container__metadata-item',
              '.job-search-card__location',
              '.artdeco-entity-lockup__caption',
              '.job-card-container__metadata-wrapper li',
              '.base-search-card__metadata'
            ].join(', ')
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const snippet =
        (
          root.querySelector(
            '.job-card-container__footer-item, .job-search-card__snippet, .job-card-list__insight'
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const key = jobId || href || title
      if (!title || seen.has(key)) continue
      seen.add(key)
      out.push({ title, company, location, url: href, snippet, jobId })
    }
    return out
  })
}

async function scrollResults(page: Page, times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => {
      const pane =
        document.querySelector(
          '.jobs-search-results-list, .scaffold-layout__list, ul.jobs-search__results-list, .jobs-search__results-list'
        ) || document.scrollingElement
      if (pane) pane.scrollBy(0, 900)
    })
    await new Promise((r) => setTimeout(r, 700))
  }
}

async function pageNeedsLogin(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const href = location.href
    const text = (document.body?.innerText || '').toLowerCase()
    if (/\/login|\/uas\/login|\/checkpoint\//.test(href)) return true
    if (document.querySelector('input#username, input[name="session_key"]')) return true
    // Guest results pages are OK — don't treat marketing banners alone as a hard login wall
    // if job cards are present.
    const hasCards = Boolean(
      document.querySelector(
        'li.jobs-search-results__list-item, div.job-card-container, div.base-card, ul.jobs-search__results-list > li, div[data-job-id]'
      )
    )
    if (hasCards) return false
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
  // Prefer authenticated search; guest collection is a secondary path.
  const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l}&refresh=true`
  const guestUrl = `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l}&position=1&pageNum=0`

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await new Promise((r) => setTimeout(r, 1600))

    if (await pageNeedsLogin(page)) {
      // Try guest/public collection URL once before fixture fallback.
      try {
        await page.goto(guestUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await new Promise((r) => setTimeout(r, 1500))
      } catch {
        /* ignore */
      }
      if (await pageNeedsLogin(page)) {
        const fallback = loadFixture(options.fixturePath)
        if (fallback.length) {
          return {
            jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
            usedFixture: true,
            message:
              'LinkedIn needs login. Sign in in the automation browser, or use fixture results for this run.',
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
    }

    await page
      .waitForSelector(
        'li.jobs-search-results__list-item, div.job-card-container, div.base-card, ul.jobs-search__results-list > li, div[data-job-id]',
        { timeout: 12_000 }
      )
      .catch(() => null)

    let raw = await scrapeCards(page)
    if (raw.length < Math.min(8, max)) {
      await scrollResults(page, 5)
      raw = await scrapeCards(page)
    }
    if (raw.length === 0) {
      await new Promise((r) => setTimeout(r, 2200))
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
