/**
 * Playwright BrowserController stub (Milestone 2 will implement launch/attach).
 * Kept in main process only — never imported from the renderer.
 */
import type { BrowserPreference } from '../../src/shared/preferences'

export interface BrowserControllerStatus {
  implemented: false
  preferred: BrowserPreference
  message: string
}

export function browserControllerStatus(
  preferred: BrowserPreference
): BrowserControllerStatus {
  return {
    implemented: false,
    preferred,
    message:
      'Milestone 2: Playwright will launch Chrome/Edge with a dedicated persistent profile under userData.'
  }
}

/** Reserved for Milestone 2 — persistent profile path under app userData. */
export function automationProfileDir(userDataPath: string, browser: BrowserPreference): string {
  const folder =
    browser === 'edge' ? 'pw-edge-profile' : browser === 'chrome' ? 'pw-chrome-profile' : 'pw-auto-profile'
  return `${userDataPath}/browser-profiles/${folder}`
}
