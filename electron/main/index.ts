import {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  shell,
  dialog
} from 'electron'
import { readFileSync, existsSync, writeFileSync } from 'fs'
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
  buildFullBackup,
  buildProfileExport,
  parseExtensionExport,
  serializeExport,
  skipExtensionImportMessage
} from '../../src/modules/import'
import {
  applicationsToCsv,
  deleteApplication,
  dueReminders,
  parseApplications,
  recordApplyResults,
  updateApplication
} from '../../src/modules/tracker'
import { draftCoverLetter, refineAnswer, tailorResume } from '../../src/modules/ai'
import { importResumeFromPath } from '../../src/modules/resume'
import { mergeIntoBank } from '../../src/shared/answer-bank'
import type { AnswerBankEntry } from '../../src/shared/profile'
import type { ApplyResult, JobListing, MatchResult, PipelineStatus } from '../../src/shared/types'
import type { TrackerStage, TrackerStatus } from '../../src/shared/tracker'
import type { CoverLength } from '../../src/modules/ai/cover'
import type { RefineMode } from '../../src/modules/ai/refine'

let mainWindow: BrowserWindow | null = null
let lastJobs: JobListing[] = []
let lastMatches: MatchResult[] = []
let lastApplyResults: ApplyResult[] = []
let pipelineStatus: PipelineStatus = {
  stage: 'idle',
  message: 'Ready',
  updatedAt: new Date().toISOString()
}
let scheduleTimer: ReturnType<typeof setInterval> | null = null
let scheduleKickTimer: ReturnType<typeof setTimeout> | null = null
let reminderTimer: ReturnType<typeof setInterval> | null = null
const notifiedReminders = new Set<string>()

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
    width: 1180,
    height: 800,
    minWidth: 880,
    minHeight: 600,
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

function persistApplyToTracker(results: ApplyResult[]): number {
  const bundle = loadProfileBundle()
  const { applications, written } = recordApplyResults(
    bundle.applications,
    lastJobs,
    results,
    lastMatches
  )
  if (written > 0) {
    saveProfileBundle({ ...bundle, applications })
  }
  return written
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
  lastMatches = []
  lastApplyResults = []
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
  const willSubmit = prefs.applySafety === 'unattended' && prefs.allowAutoSubmit === true
  setStatus(
    'apply',
    confirmed
      ? 'Confirm apply — filling forms (submit blocked in confirm mode)…'
      : prefs.applySafety === 'unattended'
        ? willSubmit
          ? 'Unattended fill + gated submit…'
          : 'Unattended fill (allowAutoSubmit off)…'
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

  lastApplyResults = results
  const written = persistApplyToTracker(results)

  const filled = results.filter((r) => r.status === 'filled' || r.status === 'needs_you').length
  const pending = results.filter((r) => r.status === 'pending_confirm').length
  const submitted = results.filter((r) => r.submitted).length
  setStatus(
    'idle',
    `Apply done: ${filled} filled, ${pending} pending confirm, ${submitted} submitted, ${written} tracker row(s).`
  )
  return results
}

function resolveJobContext(input?: {
  title?: string
  company?: string
  description?: string
  jobId?: string
}) {
  const fromId = input?.jobId ? lastJobs.find((j) => j.id === input.jobId) : undefined
  const match = input?.jobId ? lastMatches.find((m) => m.jobId === input.jobId) : undefined
  return {
    title: input?.title || fromId?.title || match?.title || '',
    company: input?.company || fromId?.company || match?.company || '',
    description:
      input?.description ||
      fromId?.snippet ||
      ''
  }
}

function checkDueReminders(): { due: ReturnType<typeof dueReminders>; notified: number } {
  const prefs = loadPreferences()
  const bundle = loadProfileBundle()
  const due = dueReminders(bundle.applications)
  let notified = 0
  if (prefs.reminderNotifications) {
    for (const row of due) {
      const id = `${row.key}:${row.reminderAt}`
      if (notifiedReminders.has(id)) continue
      notifiedReminders.add(id)
      showDesktopNotification(
        'Follow up reminder',
        `${row.company} — ${row.title}${row.notes ? ` · ${row.notes.slice(0, 80)}` : ''}`
      )
      notified++
    }
  }
  return { due, notified }
}

let scheduleRunning = false
let lastScheduleAt: string | null = null

async function runScheduledPipeline(): Promise<{ ok: boolean; message: string }> {
  if (scheduleRunning) {
    return { ok: false, message: 'Scheduled pipeline already running.' }
  }
  scheduleRunning = true
  try {
    const { jobs, meta, history } = await runSearchInternal()
    const prefs = loadPreferences()
    const bundle = loadProfileBundle()
    const matches = await matchJobs(jobs, prefs, bundle.profile)
    lastMatches = matches
    const notify = await notifyBestFits(matches, showDesktopNotification)

    let applyNote = ''
    if (prefs.scheduledIncludeApply && prefs.applySafety === 'unattended') {
      const fitIds = matches.filter((m) => m.fits).map((m) => m.jobId).slice(0, 5)
      if (fitIds.length) {
        setStatus('apply', `Scheduled unattended apply for ${fitIds.length} best-fit job(s)…`)
        const applied = await applyInternal(fitIds, false)
        const filled = applied.filter((r) => r.status === 'filled' || r.status === 'needs_you' || r.submitted).length
        applyNote = `; applied ${filled}/${fitIds.length}`
      } else {
        applyNote = '; no fits to apply'
      }
    } else if (prefs.scheduledIncludeApply && prefs.applySafety === 'confirm') {
      applyNote = '; scheduled apply skipped (confirm mode — use Apply queue)'
    }

    lastScheduleAt = new Date().toISOString()
    const message = `Scheduled run ${lastScheduleAt}: ${jobs.length} jobs, ${matches.filter((m) => m.fits).length} fits, ${notify.notified} notified${applyNote}. (${meta.message})`
    setStatus('idle', message)
    showDesktopNotification(
      'Scheduled job search finished',
      `${jobs.length} jobs · ${matches.filter((m) => m.fits).length} fits · ${notify.notified} notified${applyNote}`
    )
    void history
    return { ok: true, message }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus('idle', `Scheduled search failed: ${message}`)
    showDesktopNotification('Scheduled job search failed', message.slice(0, 180))
    return { ok: false, message }
  } finally {
    scheduleRunning = false
  }
}

function refreshScheduleTimer(): void {
  if (scheduleTimer) {
    clearInterval(scheduleTimer)
    scheduleTimer = null
  }
  if (scheduleKickTimer) {
    clearTimeout(scheduleKickTimer)
    scheduleKickTimer = null
  }
  const mins = loadPreferences().scheduledSearchMinutes || 0
  if (mins > 0) {
    const intervalMs = Math.max(mins, 5) * 60_000
    scheduleTimer = setInterval(() => {
      void runScheduledPipeline()
    }, intervalMs)
    // Kick a first run shortly after enabling so end-to-end schedule is verifiable.
    scheduleKickTimer = setTimeout(() => {
      scheduleKickTimer = null
      if (loadPreferences().scheduledSearchMinutes > 0) {
        void runScheduledPipeline()
      }
    }, 8_000)
  }
}

function registerIpc(): void {
  ipcMain.handle('prefs:get', () => loadPreferences())
  ipcMain.handle('prefs:set', (_e, partial) => {
    const next = updatePreferences(partial)
    if (partial && Object.prototype.hasOwnProperty.call(partial, 'scheduledSearchMinutes')) {
      refreshScheduleTimer()
    }
    return next
  })
  ipcMain.handle('profile:get', () => loadProfileBundle())
  ipcMain.handle('pipeline:status', () => pipelineStatus)
  ipcMain.handle('pipeline:search-history', () => getSearchHistory())
  ipcMain.handle('pipeline:last-jobs', () => lastJobs)
  ipcMain.handle('pipeline:last-matches', () => lastMatches)
  ipcMain.handle('pipeline:last-apply', () => lastApplyResults)

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
    const results = await matchJobs(jobs?.length ? jobs : lastJobs, prefs, bundle.profile)
    lastMatches = results
    const fits = results.filter((r) => r.fits).length
    setStatus('idle', `Matched ${results.length} job(s); ${fits} meet threshold ${prefs.matchThreshold}.`)
    return results
  })

  ipcMain.handle('pipeline:notify', async (_e, matches) => {
    setStatus('notify', 'Sending desktop notifications…')
    const scored = matches?.length ? matches : lastMatches
    const result = await notifyBestFits(scored, showDesktopNotification)
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
      lastMatches = matches
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

  ipcMain.handle('tracker:list', () => parseApplications(loadProfileBundle().applications))

  ipcMain.handle(
    'tracker:update',
    (
      _e,
      key: string,
      patch: Partial<{
        stage: TrackerStage
        status: TrackerStatus
        notes: string
        reminderAt: string
        title: string
        company: string
        location: string
      }>
    ) => {
      const bundle = loadProfileBundle()
      const { applications, row } = updateApplication(bundle.applications, key, patch || {})
      saveProfileBundle({ ...bundle, applications })
      return row
    }
  )

  ipcMain.handle('tracker:delete', (_e, key: string) => {
    const bundle = loadProfileBundle()
    const applications = deleteApplication(bundle.applications, key)
    saveProfileBundle({ ...bundle, applications })
    return applications
  })

  ipcMain.handle('tracker:export-csv', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    const bundle = loadProfileBundle()
    const csv = applicationsToCsv(bundle.applications)
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export application tracker CSV',
      defaultPath: 'applications.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) {
      return { ok: false, cancelled: true, message: 'Export cancelled.' }
    }
    writeFileSync(filePath, csv, 'utf8')
    return { ok: true, path: filePath, message: `Exported ${bundle.applications.length} row(s).` }
  })

  ipcMain.handle('export:profile', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    const bundle = loadProfileBundle()
    const doc = buildProfileExport(bundle)
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export profile (job-apply-profile.json)',
      defaultPath: 'job-apply-profile.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) {
      return { ok: false, cancelled: true, message: 'Export cancelled.' }
    }
    writeFileSync(filePath, serializeExport(doc), 'utf8')
    return {
      ok: true,
      path: filePath,
      message: `Exported profile for re-import (extension-compatible).`
    }
  })

  ipcMain.handle('export:backup', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    const bundle = loadProfileBundle()
    const doc = buildFullBackup(bundle)
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export full backup (job-apply-assistant-backup)',
      defaultPath: 'job-apply-assistant-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) {
      return { ok: false, cancelled: true, message: 'Export cancelled.' }
    }
    writeFileSync(filePath, serializeExport(doc), 'utf8')
    return {
      ok: true,
      path: filePath,
      message: `Exported full backup (profile, answer bank, ${bundle.applications.length} application(s), settings).`
    }
  })

  ipcMain.handle('pipeline:schedule-now', async () => runScheduledPipeline())

  ipcMain.handle('tracker:check-reminders', () => checkDueReminders())

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

  ipcMain.handle('resume:import', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Import resume (PDF or DOCX)',
      filters: [
        { name: 'Resume', extensions: ['pdf', 'docx'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) {
      return { ok: false, cancelled: true, message: 'Resume import cancelled.' }
    }
    const bundle = loadProfileBundle()
    const result = await importResumeFromPath(filePaths[0], bundle.profile)
    if (result.ok && result.profile) {
      saveProfileBundle({
        ...bundle,
        profile: result.profile,
        resume: result.parsed
          ? { name: result.parsed.name, kind: result.parsed.kind, importedAt: new Date().toISOString() }
          : bundle.resume
      })
    }
    return result
  })

  ipcMain.handle('answerbank:list', () => loadProfileBundle().answerBank || [])

  ipcMain.handle('answerbank:upsert', (_e, entries: AnswerBankEntry[]) => {
    const bundle = loadProfileBundle()
    const merged = mergeIntoBank(bundle.answerBank || [], entries || [])
    saveProfileBundle({ ...bundle, answerBank: merged.bank })
    return merged
  })

  ipcMain.handle('answerbank:delete', (_e, index: number) => {
    const bundle = loadProfileBundle()
    const bank = [...(bundle.answerBank || [])]
    if (index >= 0 && index < bank.length) bank.splice(index, 1)
    saveProfileBundle({ ...bundle, answerBank: bank })
    return bank
  })

  ipcMain.handle(
    'ai:tailor',
    async (_e, job: { title?: string; company?: string; description?: string; jobId?: string }) => {
      const prefs = loadPreferences()
      const bundle = loadProfileBundle()
      setStatus('idle', 'Tailoring resume with Ollama…')
      const result = await tailorResume({
        ollamaUrl: prefs.ollamaUrl,
        model: prefs.ollamaModel || undefined,
        profile: bundle.profile,
        job: resolveJobContext(job),
        rules: prefs.tailoringRules
      })
      setStatus('idle', result.message)
      return result
    }
  )

  ipcMain.handle(
    'ai:cover',
    async (
      _e,
      job: { title?: string; company?: string; description?: string; jobId?: string },
      length?: CoverLength
    ) => {
      const prefs = loadPreferences()
      const bundle = loadProfileBundle()
      setStatus('idle', 'Drafting cover letter with Ollama…')
      const result = await draftCoverLetter({
        ollamaUrl: prefs.ollamaUrl,
        model: prefs.ollamaModel || undefined,
        profile: bundle.profile,
        job: resolveJobContext(job),
        length: length || 'standard'
      })
      setStatus('idle', result.message)
      return result
    }
  )

  ipcMain.handle(
    'ai:refine',
    async (_e, text: string, mode?: RefineMode, question?: string) => {
      const prefs = loadPreferences()
      const bundle = loadProfileBundle()
      return refineAnswer({
        ollamaUrl: prefs.ollamaUrl,
        model: prefs.ollamaModel || undefined,
        profile: bundle.profile,
        text,
        mode,
        question
      })
    }
  )

  ipcMain.handle('ai:apply-tailor', (_e, summary: string, skillsLine: string) => {
    const bundle = loadProfileBundle()
    const skills = String(skillsLine || '')
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const profile = {
      ...bundle.profile,
      summary: summary || bundle.profile.summary,
      skills: skills.length ? skills : bundle.profile.skills
    }
    return saveProfileBundle({ ...bundle, profile })
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  refreshScheduleTimer()
  reminderTimer = setInterval(() => {
    checkDueReminders()
  }, 15 * 60_000)
  setTimeout(() => checkDueReminders(), 5_000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (scheduleTimer) clearInterval(scheduleTimer)
  if (scheduleKickTimer) clearTimeout(scheduleKickTimer)
  if (reminderTimer) clearInterval(reminderTimer)
  void browserController.close()
  if (process.platform !== 'darwin') app.quit()
})
