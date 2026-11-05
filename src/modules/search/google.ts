/**
 * Google Jobs results via real browser scrape (no Jobs API).
 * Uses the public Google search jobs UI; falls back to fixture on block/empty.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'
import type { JobListing } from '../../shared/types'

export interface GoogleSearchOptions {
  query: string
  location: string
  fixturePath?: string
  maxResults?: number
}

export interface GoogleSearchResult {
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

function googleJobId(url: string, jobId: string, title: string, company: string): string {
  if (jobId) return `google:${jobId}`
  const key = `${title}|${company}|${url}`.toLowerCase()
  return `google:${Buffer.from(key).toString('base64url').slice(0, 28)}`
}

function toListing(card: RawCard): JobListing | null {
  const title = card.title.trim()
  if (!title) return null
  const url = card.url.trim() || `https://www.google.com/search?q=${encodeURIComponent(title + ' ' + card.company)}&udm=8`
  return {
    id: googleJobId(url, card.jobId, title, card.company),
    title,
    company: card.company.trim() || 'Unknown company',
    location: card.location.trim() || undefined,
    url,
    source: 'google',
    snippet: card.snippet.trim() || undefined
  }
}

/** Titles / companies that are Google Jobs chrome, not real listings. */
const GOOGLE_UI_NOISE =
  /^(jobs|filters?|sort by|job type|date posted|tools|results?|people also search|choose what|giving feedback|feedback on|was this helpful|related searches|next page|previous|more jobs|locations?|experience level|salary|remote|hybrid|full[- ]?time|part[- ]?time|contract|no degree|under \d|posted)$/i

function isGoogleUiNoise(title: string, company: string): boolean {
  const t = title.trim()
  const c = company.trim()
  if (!t) return true
  if (GOOGLE_UI_NOISE.test(t)) return true
  if (/feedback|was this helpful|people also|related search/i.test(t)) return true
  if (GOOGLE_UI_NOISE.test(c)) return true
  if (/^unknown company$/i.test(c) && /feedback|choose what/i.test(t)) return true
  // Single generic location/type words used as a "title"
  if (/^(remote|hybrid|on-?site)$/i.test(t)) return true
  return false
}

function looksLikeRealGoogleJob(card: RawCard): boolean {
  if (isGoogleUiNoise(card.title, card.company)) return false
  const url = (card.url || '').toLowerCase()
  const hasExternalApply =
    Boolean(url) &&
    !/google\.com\/(search|webhp|maps)/i.test(url) &&
    /^https?:\/\//i.test(url)
  const companyOk =
    Boolean(card.company.trim()) &&
    !/^unknown company$/i.test(card.company) &&
    !GOOGLE_UI_NOISE.test(card.company.trim())
  // Require an external apply/career link, or a plausible company + non-noise title.
  if (hasExternalApply && card.title.length >= 4) return true
  if (companyOk && card.title.length >= 8 && !/google\.com\/webhp/i.test(url)) return true
  return false
}

async function scrapeCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const out: RawCard[] = []
    const seen = new Set<string>()
    const noiseTitle =
      /^(jobs|filters?|sort by|job type|date posted|tools|results?|people also search|choose what|giving feedback|feedback on|was this helpful|related searches|next page|previous|more jobs|locations?|experience level|salary|remote|hybrid|full[- ]?time|part[- ]?time|contract|no degree)$/i

    // Prefer known Google Jobs card roots; avoid bare `li` / every jscontroller (UI chrome).
    const cards = Array.from(
      document.querySelectorAll(
        'div.iFjolb, div.PwjeAc, div.gWSKNe, div[jscontroller][data-ved], li[data-ved], div[role="listitem"]'
      )
    )

    for (const card of cards) {
      const root = card as HTMLElement
      const titleEl =
        (root.querySelector('div[role="heading"], h2, h3, a[href*="udm=8"]') as HTMLElement | null) ||
        null
      const title = titleEl?.innerText?.trim() || ''
      if (!title || title.length < 3 || title.length > 160) continue
      if (noiseTitle.test(title)) continue
      if (/feedback|was this helpful|people also|related search/i.test(title)) continue

      const links = Array.from(root.querySelectorAll('a[href]')) as HTMLAnchorElement[]
      const applyLink =
        links.find((a) => /apply|greenhouse|lever|ashby|workday|jobs\.|careers/i.test(a.href)) ||
        links.find(
          (a) =>
            a.href.startsWith('http') &&
            !/google\.com\/(search|webhp|maps|url\?)/i.test(a.href)
        )

      const text = root.innerText || ''
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const companyRaw = lines[1] && lines[1] !== title ? lines[1] : ''
      if (companyRaw && noiseTitle.test(companyRaw)) {
        // Second line is a filter chip, not a company — skip unless we have a real apply link.
        if (!applyLink) continue
      }
      const company = companyRaw && !noiseTitle.test(companyRaw) ? companyRaw : ''
      const location =
        lines.find((l) =>
          /\b(remote|hybrid|on-?site|united states|, [A-Z]{2}\b|IL|CA|NY|TX|WA)\b/i.test(l)
        ) || ''
      const snippet = lines.slice(2, 5).join(' · ').slice(0, 240)

      const key = `${title}|${company}|${applyLink?.href || ''}`
      if (seen.has(key)) continue
      // Prefer cards that look like job results (company or external apply link)
      if (!company && !applyLink) continue
      seen.add(key)

      out.push({
        title,
        company: company.slice(0, 120),
        location: location.slice(0, 120),
        url: applyLink?.href || '',
        snippet,
        jobId: ''
      })
      if (out.length >= 40) break
    }
    return out
  })
}

async function pageLooksBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase()
    return (
      /unusual traffic|captcha|not a robot|detected unusual/.test(text) ||
      Boolean(document.querySelector('#captcha, iframe[src*="recaptcha"]'))
    )
  })
}

function parseFixtureHtml(html: string): RawCard[] {
  const jobs: RawCard[] = []
  const re =
    /data-job-id="([^"]+)"[\s\S]*?class="job-title"[^>]*>([^<]+)[\s\S]*?class="company"[^>]*>([^<]+)[\s\S]*?class="location"[^>]*>([^<]+)[\s\S]*?class="snippet"[^>]*>([^<]+)[\s\S]*?href="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    jobs.push({
      jobId: m[1],
      title: m[2].trim(),
      company: m[3].trim(),
      location: m[4].trim(),
      snippet: m[5].trim(),
      url: m[6].trim()
    })
  }
  return jobs
}

export async function searchGoogleJobs(
  page: Page,
  options: GoogleSearchOptions
): Promise<GoogleSearchResult> {
  const max = options.maxResults ?? 20
  const q = encodeURIComponent(`${options.query} ${options.location}`.trim())
  const searchUrl = `https://www.google.com/search?q=${q}&udm=8`

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await new Promise((r) => setTimeout(r, 1600))

    if (await pageLooksBlocked(page)) {
      const fallback = loadFixture(options.fixturePath)
      if (fallback.length) {
        return {
          jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
          usedFixture: true,
          message: 'Google Jobs blocked (captcha/unusual traffic). Using fixture for this run.',
          searchUrl
        }
      }
      return {
        jobs: [],
        usedFixture: false,
        message: 'Google Jobs captcha — complete it in the automation browser, then re-run.',
        searchUrl
      }
    }

    let raw = await scrapeCards(page)
    if (raw.length === 0) {
      await new Promise((r) => setTimeout(r, 2000))
      raw = await scrapeCards(page)
    }

    const cleaned = raw.filter(looksLikeRealGoogleJob)
    const rejectedNoise = raw.length - cleaned.length

    if (cleaned.length === 0) {
      const fallback = loadFixture(options.fixturePath)
      if (fallback.length) {
        return {
          jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
          usedFixture: true,
          message:
            rejectedNoise > 0
              ? `Live Google Jobs only returned UI chrome (${rejectedNoise} noise card(s)), not job listings. Using local fixture for demo.`
              : 'Live Google Jobs returned no parseable cards. Using local fixture for demo.',
          searchUrl
        }
      }
      return {
        jobs: [],
        usedFixture: false,
        message:
          rejectedNoise > 0
            ? 'Google Jobs page had no real listings (filters/feedback chrome only). Try another query or complete any interstitial in the browser.'
            : 'No Google Jobs cards parsed. Try a different query.',
        searchUrl
      }
    }

    const jobs = cleaned
      .map(toListing)
      .filter((j): j is JobListing => Boolean(j))
      .slice(0, max)

    return {
      jobs,
      usedFixture: false,
      message: `Parsed ${jobs.length} Google Jobs card(s) from live search.`,
      searchUrl
    }
  } catch (err) {
    const fallback = loadFixture(options.fixturePath)
    if (fallback.length) {
      return {
        jobs: fallback.slice(0, max).map(toListing).filter(Boolean) as JobListing[],
        usedFixture: true,
        message: `Google Jobs navigation failed (${err instanceof Error ? err.message : String(err)}). Using fixture.`,
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

export function defaultGoogleFixturePath(appPath: string, cwd: string): string {
  const candidates = [
    join(appPath, 'fixtures', 'google-jobs-results.html'),
    join(cwd, 'fixtures', 'google-jobs-results.html'),
    join(__dirname, '../../../fixtures/google-jobs-results.html')
  ]
  return candidates.find((p) => existsSync(p)) || candidates[0]
}
