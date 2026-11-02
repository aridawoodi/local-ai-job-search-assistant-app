/**
 * Playwright BrowserController — launches Chrome or Edge with a dedicated
 * persistent profile under Electron userData so the user can log in once.
 * Never imported from the renderer.
 */
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import {
  chromium,
  type BrowserContext,
  type Page,
  type BrowserType
} from 'playwright'
import type { BrowserPreference } from '../../src/shared/preferences'
import type {
  BrowserRuntimeStatus,
  SessionCheckResult
} from '../../src/shared/types'

export type ResolvedChannel = 'chrome' | 'msedge'

export function automationProfileDir(
  userDataPath: string,
  browser: BrowserPreference
): string {
  const folder =
    browser === 'edge'
      ? 'pw-edge-profile'
      : browser === 'chrome'
        ? 'pw-chrome-profile'
        : 'pw-auto-profile'
  return join(userDataPath, 'browser-profiles', folder)
}

/** Chrome ↔ Edge use separate profile dirs — switching browsers requires logging in again. */
export function profileNote(browser: BrowserPreference): string {
  return (
    `Persistent profile folder for "${browser}" is isolated under userData/browser-profiles/. ` +
    'Switching Chrome ↔ Edge uses a different folder, so sessions are not shared.'
  )
}

function channelCandidates(preferred: BrowserPreference): ResolvedChannel[] {
  if (preferred === 'chrome') return ['chrome']
  if (preferred === 'edge') return ['msedge']
  return ['chrome', 'msedge']
}

export class BrowserController {
  private context: BrowserContext | null = null
  private page: Page | null = null
  private channel: ResolvedChannel | null = null
  private profileDir: string | null = null
  private preferred: BrowserPreference = 'either'
  private lastError: string | null = null

  status(): BrowserRuntimeStatus {
    return {
      implemented: true,
      open: Boolean(this.context),
      preferred: this.preferred,
      channel: this.channel,
      profileDir: this.profileDir,
      message: this.context
        ? `Browser open via ${this.channel} (${this.profileDir})`
        : this.lastError
          ? `Browser closed — last error: ${this.lastError}`
          : 'Browser not open. Use Open browser to launch Chrome/Edge with a persistent profile.',
      profileNote: profileNote(this.preferred)
    }
  }

  async ensureOpen(
    userDataPath: string,
    preferred: BrowserPreference
  ): Promise<BrowserRuntimeStatus> {
    this.preferred = preferred
    if (this.context && this.page && !this.page.isClosed()) {
      return this.status()
    }
    await this.close()

    const profileDir = automationProfileDir(userDataPath, preferred)
    if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true })

    const errors: string[] = []
    for (const channel of channelCandidates(preferred)) {
      try {
        const browserType: BrowserType = chromium
        this.context = await browserType.launchPersistentContext(profileDir, {
          channel,
          headless: false,
          viewport: { width: 1280, height: 900 },
          args: ['--disable-blink-features=AutomationControlled']
        })
        this.page = this.context.pages()[0] || (await this.context.newPage())
        this.channel = channel
        this.profileDir = profileDir
        this.lastError = null
        this.context.on('close', () => {
          this.context = null
          this.page = null
        })
        return this.status()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${channel}: ${msg}`)
        this.context = null
        this.page = null
      }
    }

    this.lastError = errors.join(' | ') || 'No compatible browser found'
    throw new Error(
      `Could not launch browser for preference "${preferred}". ${this.lastError}`
    )
  }

  async getPage(
    userDataPath: string,
    preferred: BrowserPreference
  ): Promise<Page> {
    await this.ensureOpen(userDataPath, preferred)
    if (!this.page || this.page.isClosed()) {
      this.page = await this.context!.newPage()
    }
    return this.page
  }

  async openStartPage(
    userDataPath: string,
    preferred: BrowserPreference
  ): Promise<BrowserRuntimeStatus> {
    const page = await this.getPage(userDataPath, preferred)
    await page.goto('https://www.indeed.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    })
    return this.status()
  }

  async checkSessions(
    userDataPath: string,
    preferred: BrowserPreference
  ): Promise<SessionCheckResult[]> {
    const page = await this.getPage(userDataPath, preferred)
    const results: SessionCheckResult[] = []

    results.push(await this.probeIndeed(page))
    results.push(await this.probeLinkedIn(page))
    results.push(await this.probeGoogle(page))

    return results
  }

  private async probeIndeed(page: Page): Promise<SessionCheckResult> {
    const url = 'https://www.indeed.com/'
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      const snapshot = await page.evaluate(() => {
        const text = (document.body?.innerText || '').toLowerCase()
        const hasCaptcha =
          /captcha|verify you are a human|unusual traffic/.test(text) ||
          Boolean(document.querySelector('#captcha, iframe[src*="captcha"]'))
        const signedIn = Boolean(
          document.querySelector(
            '[data-gnav-element-name="AccountMenu"], #AccountMenu, a[href*="account/"], button[aria-label*="Account"]'
          )
        )
        const loginPrompt = /sign in|log in/.test(text) && !signedIn
        return { hasCaptcha, signedIn, loginPrompt, href: location.href }
      })

      if (snapshot.hasCaptcha) {
        return {
          source: 'indeed',
          ready: false,
          needsLogin: false,
          pauseKind: 'captcha',
          message: 'Indeed showed a captcha / bot check — complete it in the browser window.',
          url: snapshot.href
        }
      }
      if (snapshot.signedIn) {
        return {
          source: 'indeed',
          ready: true,
          needsLogin: false,
          pauseKind: null,
          message: 'Indeed session looks signed in (cookies reusable).',
          url: snapshot.href
        }
      }
      // Indeed search often works without login
      return {
        source: 'indeed',
        ready: true,
        needsLogin: snapshot.loginPrompt,
        pauseKind: snapshot.loginPrompt ? 'login' : null,
        message: snapshot.loginPrompt
          ? 'Indeed reachable; optional sign-in recommended for richer results. Search works without login.'
          : 'Indeed reachable. Public search available without login.',
        url: snapshot.href
      }
    } catch (err) {
      return {
        source: 'indeed',
        ready: false,
        needsLogin: false,
        pauseKind: 'blocked',
        message: err instanceof Error ? err.message : String(err),
        url
      }
    }
  }

  private async probeLinkedIn(page: Page): Promise<SessionCheckResult> {
    const url = 'https://www.linkedin.com/login'
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 800))
      const snapshot = await page.evaluate(() => {
        const href = location.href
        const text = (document.body?.innerText || '').toLowerCase()
        const onFeed = /linkedin\.com\/(feed|jobs)/.test(href)
        const hasLoginForm = Boolean(
          document.querySelector('input#username, input[name="session_key"]')
        )
        const authWall = /sign in|join now|welcome back/.test(text) && hasLoginForm
        return { href, onFeed, hasLoginForm, authWall }
      })

      if (snapshot.onFeed && !snapshot.hasLoginForm) {
        return {
          source: 'linkedin',
          ready: true,
          needsLogin: false,
          pauseKind: null,
          message: 'LinkedIn session ready (logged in).',
          url: snapshot.href
        }
      }
      return {
        source: 'linkedin',
        ready: false,
        needsLogin: true,
        pauseKind: 'login',
        message:
          'LinkedIn needs a manual login in the automation browser. Pause here, sign in, then Check sessions again.',
        url: snapshot.href
      }
    } catch (err) {
      return {
        source: 'linkedin',
        ready: false,
        needsLogin: true,
        pauseKind: 'login',
        message: err instanceof Error ? err.message : String(err),
        url
      }
    }
  }

  private async probeGoogle(page: Page): Promise<SessionCheckResult> {
    const url = 'https://www.google.com/search?q=software+engineer&udm=8'
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 800))
      const snapshot = await page.evaluate(() => {
        const text = (document.body?.innerText || '').toLowerCase()
        const blocked =
          /unusual traffic|captcha|not a robot|detected unusual/.test(text) ||
          Boolean(document.querySelector('#captcha, iframe[src*="recaptcha"]'))
        return { blocked, href: location.href }
      })
      if (snapshot.blocked) {
        return {
          source: 'google',
          ready: false,
          needsLogin: false,
          pauseKind: 'captcha',
          message: 'Google Jobs showed captcha / unusual traffic — complete it in the browser.',
          url: snapshot.href
        }
      }
      return {
        source: 'google',
        ready: true,
        needsLogin: false,
        pauseKind: null,
        message: 'Google Jobs reachable (public search; login optional).',
        url: snapshot.href
      }
    } catch (err) {
      return {
        source: 'google',
        ready: false,
        needsLogin: false,
        pauseKind: 'blocked',
        message: err instanceof Error ? err.message : String(err),
        url
      }
    }
  }

  async close(): Promise<void> {
    try {
      await this.context?.close()
    } catch {
      /* ignore */
    }
    this.context = null
    this.page = null
  }
}

/** Singleton used by main-process IPC. */
export const browserController = new BrowserController()
