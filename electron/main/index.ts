import {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  shell,
  dialog
} from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { loadPreferences, updatePreferences } from './preferences-store'
import { loadProfileBundle, saveProfileBundle } from './profile-store'
import { checkOllama } from './ollama'
import { browserController } from './browser-controller'
import { getSearchHistory, searchJobs } from '../../src/modules/search'
import { matchJobs } from '../../src/modules/match'
import { notifyBestFits } from '../../src/modules/notify'
import { applyToJobs, confirmAndFill } from '../../src/modules/apply'
import {
  parseExtensionExport,
  skipExtensionImportMessage
} from '../../src/modules/import'
import type { JobListing, PipelineStatus } from '../../src/shared/types'

let mainWindow: BrowserWindow | null = null
let lastJobs: JobListing[] = []
let pipelineStatus: PipelineStatus = {
  stage: 'idle',
  message: 'Ready',
  updatedAt: new Date().toISOString()
}

function setStatus(stage: PipelineStatus['stage'], message: string): void {
  pipelineStatus = { stage, message, updatedAt: new Date().toISOString() }
}

function sampleFixturePath(): string {
  const candidates = [
    join(app.getAppPath(), 'fixtures', 'sample-profile.json'),
    join(__dirname, '../../fixtures/sample-profile.json'),
    join(process.cwd(), 'fixtures', 'sample-profile.json')
  ]
  return candidates.find((p) => existsSync(p)) || candidates[0]
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 840,
    minHeight: 560,
    title: 'Job Search Assistant',
    show: false,
    backgroundColor: '#0f1220',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function importFromFilePath(filePath: string) {
  const text = readFileSync(filePath, 'utf8')
  const result = parseExtensionExport(text, filePath)
  if (result.ok && result.bundle) {
    saveProfileBundle(result.bundle)
    const ollamaUrl =
      (result.bundle.settings.ollamaUrl as string | undefined) ||
      loadPreferences().ollamaUrl
    updatePreferences({
      extensionImportStatus: 'imported',
      onboardingComplete: true,
      ollamaUrl
    })
  }
  return {
    ok: result.ok,
    message: result.message,
    format: result.format
  }
}

function showDesktopNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

async function runSearchInternal() {
  const prefs = loadPreferences()
  const bundle = loadProfileBundle()
  setStatus('browser', 'Opening automation browser…')
  const page = await browserController.getPage(app.getPath('userData'), prefs.browser)
  const enabled = Object.entries(prefs.enabledSources)
    .filter(([, on]) => on)
    .map(([k]) => k)
  setStatus('search', `Searching ${enabled.join(', ') || 'no sources'}…`)
  const result = await searchJobs(prefs, {
    page,
    profile: bundle.profile,
    appPath: app.getAppPath(),
    cwd: process.cwd()
  })
  lastJobs = result.jobs
  setStatus(
    'idle',
    `${result.jobs.length} job(s) from ${result.sources.length} source(s); query="${result.query}"`
  )
  return {
    jobs: result.jobs,
    meta: {
      sources: result.sources,
      usedFixture: result.usedFixture,
      message: result.message,
      searchUrl: result.searchUrl,
      query: result.query,
      location: result.location,
      runId: result.runId
    },
    history: getSearchHistory()
  }
}

async function applyInternal(jobIds: string[], confirmed: boolean) {
  const prefs = loadPreferences()
  const bundle = loadProfileBundle()
  setStatus(
    'apply',
    confirmed
      ? 'Confirm apply — filling forms (no auto-submit)…'
      : prefs.applySafety === 'unattended'
        ? 'Unattended fill (no auto-submit)…'
        : 'Apply — queueing for confirmation…'
  )
  const page = await browserController.getPage(app.getPath('userData'), prefs.browser)
  const ctx = {
    page,
    jobs: lastJobs,
    profile: bundle.profile,
    appPath: app.getAppPath(),
    cwd: process.cwd(),
    confirmed
  }
  const results = confirmed
    ? await confirmAndFill(jobIds, prefs, ctx)
    : await applyToJobs(jobIds, prefs, ctx)

  const filled = results.filter((r) => r.status === 'filled' || r.status === 'needs_you').length
  const pending = results.filter((r) => r.status === 'pending_confirm').length
  setStatus(
    'idle',
    `Apply done: ${filled} filled, ${pending} pending confirm, 0 submitted (safety).`
  )
  return results
}

function registerIpc(): void {
  ipcMain.handle('prefs:get', () => loadPreferences())
  ipcMain.handle('prefs:set', (_e, partial) => updatePreferences(partial))
  ipcMain.handle('profile:get', () => loadProfileBundle())
  ipcMain.handle('pipeline:status', () => pipelineStatus)
  ipcMain.handle('pipeline:search-history', () => getSearchHistory())

  ipcMain.handle('browser:status', () => {
    const prefs = loadPreferences()
    const status = browserController.status()
    return { ...status, preferred: prefs.browser }
  })

  ipcMain.handle('browser:open', async () => {
    const prefs = loadPreferences()
    setStatus('browser', 'Launching Chrome/Edge with persistent profile…')
    try {
      const status = await browserController.openStartPage(
        app.getPath('userData'),
        prefs.browser
      )
      setStatus('idle', status.message)
      return status
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('idle', message)
      throw err
    }
  })

  ipcMain.handle('browser:check-sessions', async () => {
    const prefs = loadPreferences()
    setStatus('browser', 'Checking Indeed / LinkedIn / Google sessions…')
    try {
      const results = await browserController.checkSessions(
        app.getPath('userData'),
        prefs.browser
      )
      const needs = results.filter((r) => r.needsLogin || !r.ready)
      setStatus(
        'idle',
        needs.length
          ? `Session check: ${needs.map((n) => n.source).join(', ')} need attention — log in manually in the browser window.`
          : 'Sessions look ready.'
      )
      return results
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('idle', message)
      throw err
    }
  })

  ipcMain.handle('browser:close', async () => {
    await browserController.close()
    setStatus('idle', 'Automation browser closed.')
    return browserController.status()
  })

  ipcMain.handle('pipeline:search', async () => {
    try {
      return await runSearchInternal()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('idle', message)
      throw err
    }
  })

  ipcMain.handle('pipeline:match', async (_e, jobs: JobListing[]) => {
    setStatus('match', 'Matching against profile…')
    const prefs = loadPreferences()
    const bundle = loadProfileBundle()
    if (jobs?.length) lastJobs = jobs
    const results = await matchJobs(jobs, prefs, bundle.profile)
    const fits = results.filter((r) => r.fits).length
    setStatus('idle', `Matched ${results.length} job(s); ${fits} meet threshold ${prefs.matchThreshold}.`)
    return results
  })

  ipcMain.handle('pipeline:notify', async (_e, matches) => {
    setStatus('notify', 'Sending desktop notifications…')
    const result = await notifyBestFits(matches, showDesktopNotification)
    setStatus(
      'idle',
      `Notified ${result.notified} best-fit job(s)` +
        (result.skippedDuplicate ? ` (${result.skippedDuplicate} duplicate(s) skipped).` : '.')
    )
    return result
  })

  ipcMain.handle('pipeline:apply', async (_e, jobIds: string[]) => {
    try {
      return await applyInternal(jobIds, false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('idle', message)
      throw err
    }
  })

  ipcMain.handle('pipeline:confirm-apply', async (_e, jobIds: string[]) => {
    try {
      return await applyInternal(jobIds, true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('idle', message)
      throw err
    }
  })

  ipcMain.handle('pipeline:run', async () => {
    try {
      const { jobs, meta, history } = await runSearchInternal()
      setStatus('match', 'Matching…')
      const prefs = loadPreferences()
      const bundle = loadProfileBundle()
      const matches = await matchJobs(jobs, prefs, bundle.profile)
      setStatus('notify', 'Notifying best fits…')
      const notify = await notifyBestFits(matches, showDesktopNotification)
      setStatus(
        'idle',
        `Pipeline done: ${jobs.length} jobs, ${matches.filter((m) => m.fits).length} fits, ${notify.notified} notified.`
      )
      return { jobs, matches, notified: notify.notified, meta, history }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('idle', message)
      throw err
    }
  })

  ipcMain.handle('import:extension', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Import Job Apply Assistant profile or backup',
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) {
      return { ok: false, cancelled: true, message: 'Import cancelled.' }
    }
    return importFromFilePath(filePaths[0])
  })

  ipcMain.handle('import:sample', async () => {
    const path = sampleFixturePath()
    if (!existsSync(path)) {
      return {
        ok: false,
        message: `Sample fixture not found at ${path}`
      }
    }
    return importFromFilePath(path)
  })

  ipcMain.handle('import:skip', () => {
    skipExtensionImportMessage()
    return updatePreferences({
      extensionImportStatus: 'skipped',
      onboardingComplete: true
    })
  })

  ipcMain.handle('onboarding:complete', () =>
    updatePreferences({ onboardingComplete: true })
  )

  ipcMain.handle('ollama:check', async () => {
    const prefs = loadPreferences()
    return checkOllama(prefs.ollamaUrl)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void browserController.close()
  if (process.platform !== 'darwin') app.quit()
})
