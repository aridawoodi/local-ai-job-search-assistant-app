/**
 * First search source (Milestone 2): Indeed job search UI via Playwright.
 * No Indeed API — scrapes result cards from the real results page.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'
import type { JobListing } from '../../shared/types'

export interface IndeedSearchOptions {
  query: string
  location: string
  /** Optional path to fixtures/indeed-results.html for offline/captcha fallback. */
  fixturePath?: string
  maxResults?: number
}

export interface IndeedSearchResult {
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
  jobKey: string
}

function indeedJobId(url: string, jobKey: string): string {
  if (jobKey) return `indeed:${jobKey}`
  try {
    const u = new URL(url)
    const jk = u.searchParams.get('jk') || u.searchParams.get('vjk')
    if (jk) return `indeed:${jk}`
  } catch {
    /* ignore */
  }
  return `indeed:${Buffer.from(url).toString('base64url').slice(0, 24)}`
}

function toListing(card: RawCard): JobListing | null {
  const title = card.title.trim()
  if (!title) return null
  let url = card.url || ''
  if (url.startsWith('/')) url = `https://www.indeed.com${url}`
  if (!url && card.jobKey) url = `https://www.indeed.com/viewjob?jk=${card.jobKey}`
  if (!url) return null
  return {
    id: indeedJobId(url, card.jobKey),
    title,
    company: card.company.trim() || 'Unknown company',
    location: card.location.trim() || undefined,
    url: url.split('&from=')[0],
    source: 'indeed',
    snippet: card.snippet.trim() || undefined
  }
}

/** DOM scrape that tolerates several Indeed card layouts. */
async function scrapeCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const out: RawCard[] = []
    const seen = new Set<string>()

    const cards = Array.from(
      document.querySelectorAll(
        'div.job_seen_beacon, div.cardOutline, li.css-5lfssg, div.resultContent, div[data-jk]'
      )
    )

    for (const card of cards) {
      const root = card as HTMLElement
      const jk =
        root.getAttribute('data-jk') ||
        root.querySelector('[data-jk]')?.getAttribute('data-jk') ||
        ''

      const titleEl =
        (root.querySelector('h2.jobTitle a, a.jcs-JobTitle, h2 a[data-jk], a[id^="job_"]') as
          | HTMLAnchorElement
          | null) ||
        (root.querySelector('a[href*="/viewjob"], a[href*="/rc/clk"]') as HTMLAnchorElement | null)

      const title =
        titleEl?.innerText?.trim() ||
        (root.querySelector('h2, h2 span') as HTMLElement | null)?.innerText?.trim() ||
        ''

      let href = titleEl?.href || ''
      if (!href && jk) href = `https://www.indeed.com/viewjob?jk=${jk}`

      const company =
        (
          root.querySelector(
            '[data-testid="company-name"], span.companyName, span[data-testid="company-name"]'
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const location =
        (
          root.querySelector(
            '[data-testid="text-location"], div.companyLocation, .companyLocation'
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const snippet =
        (
          root.querySelector(
            '.job-snippet, [data-testid="job-snippet"], .jobCardShelfContainer'
          ) as HTMLElement | null
        )?.innerText?.trim() || ''

      const key = jk || href || title
      if (!title || seen.has(key)) continue
      seen.add(key)
      out.push({ title, company, location, url: href, snippet, jobKey: jk })
    }
    return out
  })
}

async function pageLooksBlocked(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase()
    if (/captcha|verify you are a human|unusual traffic|blocked/.test(text)) {
      return 'captcha_or_block'
    }
    if (document.querySelector('#captcha, iframe[src*="captcha"]')) {
      return 'captcha_or_block'
    }
    return null
  })
}

function parseFixtureHtml(html: string): RawCard[] {
  // Minimal parse for our shipped fixture markup
  const jobs: RawCard[] = []
  const re =
    /data-jk="([^"]+)"[\s\S]*?class="job-title"[^>]*>([^<]+)[\s\S]*?class="company"[^>]*>([^<]+)[\s\S]*?class="location"[^>]*>([^<]+)[\s\S]*?class="snippet"[^>]*>([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    jobs.push({
      jobKey: m[1],
      title: m[2].trim(),
      company: m[3].trim(),
      location: m[4].trim(),
      snippet: m[5].trim(),
      url: `https://www.indeed.com/viewjob?jk=${m[1]}`
    })
  }
  return jobs
}

export async function searchIndeed(
  page: Page,
  options: IndeedSearchOptions
): Promise<IndeedSearchResult> {
  const max = options.maxResults ?? 20
  const q = encodeURIComponent(options.query)
  const l = encodeURIComponent(options.location)
  const searchUrl = `https://www.indeed.com/jobs?q=${q}&l=${l}`

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await new Promise((r) => setTimeout(r, 1500))

    const blocked = await pageLooksBlocked(page)
    if (blocked) {
      const fallback = loadFixture(options.fixturePath)
      if (fallback.length) {
        return {
          jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
          usedFixture: true,
          message:
            'Indeed blocked with captcha/bot check. Complete it in the browser, or use fixture results for this run.',
          searchUrl
        }
      }
      return {
        jobs: [],
        usedFixture: false,
        message:
          'Indeed captcha/bot check — finish it in the automation browser, then Run search again.',
        searchUrl
      }
    }

    let raw = await scrapeCards(page)
    if (raw.length === 0) {
      // Soft wait for late-hydrated cards
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
            'Live Indeed returned no parseable cards (layout change or empty). Using local fixture for demo.',
          searchUrl
        }
      }
      return {
        jobs: [],
        usedFixture: false,
        message: 'No Indeed job cards parsed. Try a different query or sign in.',
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
      message: `Parsed ${jobs.length} Indeed job card(s) from live search.`,
      searchUrl
    }
  } catch (err) {
    const fallback = loadFixture(options.fixturePath)
    if (fallback.length) {
      return {
        jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
        usedFixture: true,
        message: `Indeed navigation failed (${err instanceof Error ? err.message : String(err)}). Using fixture.`,
        searchUrl
      }
    }
    throw err
  }
}

function loadFixture(fixturePath?: string): RawCard[] {
  if (!fixturePath || !existsSync(fixturePath)) return []
  try {
    const html = readFileSync(fixturePath, 'utf8')
    return parseFixtureHtml(html)
  } catch {
    return []
  }
}

export function defaultFixturePath(appPath: string, cwd: string): string {
  const candidates = [
    join(appPath, 'fixtures', 'indeed-results.html'),
    join(cwd, 'fixtures', 'indeed-results.html'),
    join(__dirname, '../../../fixtures/indeed-results.html')
  ]
  return candidates.find((p) => existsSync(p)) || candidates[0]
}
