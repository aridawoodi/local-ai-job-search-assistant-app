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
import {
  applyToJobs,
  confirmAndFill,
  resolveOpenPostingUrl
} from '../../src/modules/apply'
import { demoPostingReason } from '../../src/shared/job-urls'
import { patchProfileField } from '../../src/shared/profile-field-patch'
import { mergeIntoBank, shouldLearnQuestion } from '../../src/shared/answer-bank'
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
import {
  commitResumeImport,
  previewResumeFromPath,
  rereadResumeWithAi,
  type ResumeImportPatch,
  type ResumeReviewKey
} from '../../src/modules/resume'
import {
  emptyPause,
  pauseFromSearchSources,
  pickSessionPause,
  type PipelinePause
} from '../../src/shared/pause'
import type { AnswerBankEntry, UserProfile } from '../../src/shared/profile'
import { prepareProfileForSave } from '../../src/shared/profile-helpers'
import type { ApplyResult, JobListing, MatchResult, PipelineStatus } from '../../src/shared/types'
import type { TrackerStage, TrackerStatus } from '../../src/shared/tracker'
import type { CoverLength } from '../../src/modules/ai/cover'
import type { RefineMode } from '../../src/modules/ai/refine'

let mainWindow: BrowserWindow | null = null
let lastJobs: JobListing[] = []
let lastMatches: MatchResult[] = []
let lastApplyResults: ApplyResult[] = []
let lastPause: PipelinePause = emptyPause()
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

function setPause(pause: PipelinePause, notify = true): void {
  lastPause = pause
  if (pause.active) {
    setStatus('paused', `${pause.title}: ${pause.message}`)
    if (notify) {
      showDesktopNotification(
        `Paused — ${pause.title}`,
        pause.message.slice(0, 180)
      )
    }
  }
}

function clearPauseState(): PipelinePause {
  lastPause = emptyPause()
  if (pipelineStatus.stage === 'paused') {
    setStatus('idle', 'Pause cleared — ready to continue.')
  }
  return lastPause
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
    title: 'AI Job Application Assistant',
    show: false,
    // Quiet Chrome light — matches renderer --bg; avoids dark flash before paint
    backgroundColor: '#f5f6fb',
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
  const searchPause = pauseFromSearchSources(result.sources)
  if (searchPause.active) {
    setPause(searchPause)
  } else {
    clearPauseState()
    setStatus(
      'idle',
      `${result.jobs.length} job(s) from ${result.sources.length} source(s); query="${result.query}"`
    )
  }
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
    history: getSearchHistory(),
    pause: lastPause
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
  ipcMain.handle('profile:save', (_e, profile: UserProfile) => {
    const bundle = loadProfileBundle()
    const next = prepareProfileForSave(profile || bundle.profile)
    return saveProfileBundle({ ...bundle, profile: next })
  })
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
      const pause = pickSessionPause(results)
      // Soft login prompts on Indeed (search still works) don't hard-pause.
      const hard =
        pause.active &&
        (pause.kind === 'captcha' ||
          (pause.kind === 'login' && pause.source !== 'indeed') ||
          pause.kind === 'blocked')
      if (hard) {
        setPause(pause)
      } else {
        clearPauseState()
        const needs = results.filter((r) => r.needsLogin || !r.ready)
        setStatus(
          'idle',
          needs.length
            ? `Session check: ${needs.map((n) => n.source).join(', ')} need attention — log in manually in the browser window.`
            : 'Sessions look ready.'
        )
      }
      return results
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus('idle', message)
      throw err
    }
  })

  ipcMain.handle('pipeline:pause-get', () => lastPause)

  ipcMain.handle('pipeline:pause-clear', () => clearPauseState())

  ipcMain.handle('pipeline:pause-resume', async () => {
    const prefs = loadPreferences()
    setStatus('browser', 'Resuming — re-checking sessions…')
    try {
      await browserController.ensureOpen(app.getPath('userData'), prefs.browser)
      const sessions = await browserController.checkSessions(
        app.getPath('userData'),
        prefs.browser
      )
      const pause = pickSessionPause(sessions)
      const hard =
        pause.active &&
        (pause.kind === 'captcha' ||
          (pause.kind === 'login' && pause.source !== 'indeed') ||
          pause.kind === 'blocked')
      if (hard) {
        setPause(pause, false)
      } else {
        clearPauseState()
        setStatus('idle', 'Sessions clear — resume search or apply when ready.')
      }
      return { pause: lastPause, sessions }
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
      const searchPause = lastPause
      setStatus('match', 'Matching…')
      const prefs = loadPreferences()
      const bundle = loadProfileBundle()
      const matches = await matchJobs(jobs, prefs, bundle.profile)
      lastMatches = matches
      setStatus('notify', 'Notifying best fits…')
      const notify = await notifyBestFits(matches, showDesktopNotification)
      const fits = matches.filter((m) => m.fits).length
      const summary = `Pipeline done: ${jobs.length} jobs, ${fits} fits, ${notify.notified} notified.`
      // Keep captcha/login pause visible after a fixture-backed run — don't bury it under idle.
      if (searchPause.active) {
        setStatus(
          'paused',
          `${summary} Still paused — ${searchPause.title}. ${searchPause.message}`
        )
      } else {
        setStatus('idle', summary)
      }
      return {
        jobs,
        matches,
        notified: notify.notified,
        meta,
        history,
        pause: lastPause
      }
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
      extensionImportStatus: 'skipped'
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
    return previewResumeFromPath(filePaths[0])
  })

  ipcMain.handle(
    'resume:commit',
    async (
      _e,
      payload: {
        patch: ResumeImportPatch
        resumeText: string
        selected: ResumeReviewKey[]
        parsed?: { name: string; kind: 'pdf' | 'docx' }
      }
    ) => {
      const bundle = loadProfileBundle()
      const result = commitResumeImport(
        bundle.profile,
        payload.patch,
        payload.resumeText || '',
        payload.selected
      )
      if (result.ok && result.profile) {
        saveProfileBundle({
          ...bundle,
          profile: result.profile,
          resume: payload.parsed
            ? {
                name: payload.parsed.name,
                kind: payload.parsed.kind,
                importedAt: new Date().toISOString()
              }
            : bundle.resume
        })
      }
      return result
    }
  )

  ipcMain.handle(
    'resume:ai-reread',
    async (
      _e,
      payload: { resumeText: string; patch: ResumeImportPatch }
    ) => {
      const prefs = loadPreferences()
      setStatus('idle', 'Re-reading resume with Ollama…')
      const result = await rereadResumeWithAi({
        resumeText: payload.resumeText || '',
        rulesPatch: payload.patch,
        ollamaUrl: prefs.ollamaUrl,
        model: prefs.ollamaModel || undefined
      })
      setStatus('idle', result.message)
      return result
    }
  )

  ipcMain.handle('diag:info', async () => {
    const prefs = loadPreferences()
    const bundle = loadProfileBundle()
    const ollama = await checkOllama(prefs.ollamaUrl)
    const browser = browserController.status()
    const p = bundle.profile
    const missing: string[] = []
    if (!p.firstName) missing.push('first name')
    if (!p.email) missing.push('email')
    if (!p.phone) missing.push('phone')
    if (!(p.resumeText || '').trim()) missing.push('resume text')

    let lastFill: {
      filled: number
      needsYou: number
      skipped: number
    } | null = null
    const last = lastApplyResults[0]
    if (last?.fields?.length) {
      lastFill = {
        filled: last.fields.filter((f) => f.status === 'filled').length,
        needsYou: last.fields.filter(
          (f) => f.status === 'needs_you' || f.status === 'missing'
        ).length,
        skipped: last.fields.filter((f) => f.status === 'skipped').length
      }
    }

    return {
      version: app.getVersion() || '0.1.0',
      platform: process.platform,
      arch: process.arch,
      ollamaReachable: ollama.reachable,
      ollamaModelCount: (ollama.models || []).length,
      ollamaModelHint: (ollama.models || [])[0],
      useLlm: Boolean(prefs.ollamaModel),
      profileComplete: missing.length === 0,
      profileMissing: missing,
      resumeSaved: Boolean(
        (bundle.resume as { name?: string } | undefined)?.name ||
          (p.resumeText || '').trim()
      ),
      browserOpen: browser.open,
      browserChannel: browser.channel,
      lastFill
    }
  })

  ipcMain.handle('practice:open', async () => {
    const candidates = [
      join(app.getAppPath(), 'fixtures', 'practice-apply-form.html'),
      join(__dirname, '../../fixtures/practice-apply-form.html'),
      join(process.cwd(), 'fixtures', 'practice-apply-form.html')
    ]
    const path = candidates.find((p) => existsSync(p))
    if (!path) {
      return { ok: false, message: 'Practice fixture not found.' }
    }
    const url = `file://${path}`
    try {
      const prefs = loadPreferences()
      const page = await browserController.getPage(app.getPath('userData'), prefs.browser)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      return {
        ok: true,
        message:
          'Opened practice form in the automation browser. Use Apply → Fill, or refine answers on Resume.'
      }
    } catch (err) {
      await shell.openExternal(url)
      return {
        ok: true,
        message: `Opened practice form in your default browser (${
          err instanceof Error ? err.message : 'automation browser unavailable'
        }).`
      }
    }
  })

  ipcMain.handle('jobs:open-posting', async (_e, jobId: string) => {
    const job = lastJobs.find((j) => j.id === jobId)
    if (!job) {
      return { ok: false, usedPractice: false, message: 'Job not found in current search results.' }
    }
    const resolved = resolveOpenPostingUrl(job, {
      appPath: app.getAppPath(),
      cwd: process.cwd()
    })
    const prefs = loadPreferences()
    try {
      const page = await browserController.getPage(app.getPath('userData'), prefs.browser)
      await page.goto(resolved.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      return {
        ok: true,
        usedPractice: resolved.usedPractice,
        url: resolved.url,
        message: resolved.usedPractice
          ? demoPostingReason(job)
          : `Opened posting in the automation browser.`
      }
    } catch (err) {
      try {
        if (resolved.url.startsWith('file://') || /^https?:\/\//i.test(resolved.url)) {
          await shell.openExternal(resolved.url)
          return {
            ok: true,
            usedPractice: resolved.usedPractice,
            url: resolved.url,
            message: resolved.usedPractice
              ? `${demoPostingReason(job)} (opened in your default browser).`
              : `Opened posting in your default browser (${
                  err instanceof Error ? err.message : 'automation browser unavailable'
                }).`
          }
        }
      } catch {
        /* fall through */
      }
      return {
        ok: false,
        usedPractice: resolved.usedPractice,
        url: resolved.url,
        message: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle(
    'apply:save-fill-answer',
    (
      _e,
      payload: { label: string; key?: string; value: string; saveForFuture: boolean }
    ) => {
      const label = String(payload?.label || '').trim()
      const value = String(payload?.value ?? '')
      const key = payload?.key
      if (!payload?.saveForFuture) {
        return {
          ok: true,
          message: 'Kept for this application only — profile and answer bank unchanged.',
          savedProfile: false,
          savedBank: false
        }
      }

      const prefs = loadPreferences()
      const bundle = loadProfileBundle()
      let savedProfile = false
      let savedBank = false
      let nextProfile = bundle.profile
      let nextBank = bundle.answerBank || []

      const patched = patchProfileField(bundle.profile, key, value)
      if (patched) {
        nextProfile = prepareProfileForSave(patched)
        savedProfile = true
      }

      if (prefs.rememberAnswers !== false && label && shouldLearnQuestion(label)) {
        const merged = mergeIntoBank(nextBank, [
          { q: label, a: value, source: 'apply-inline' }
        ])
        nextBank = merged.bank
        savedBank = merged.added > 0 || merged.updated > 0
      }

      if (savedProfile || savedBank) {
        saveProfileBundle({
          ...bundle,
          profile: nextProfile,
          answerBank: nextBank
        })
      }

      const bits = [
        savedProfile ? 'updated your profile' : null,
        savedBank ? 'saved to the answer bank' : null
      ].filter(Boolean)
      return {
        ok: true,
        message: bits.length
          ? `Saved for future applications (${bits.join(' + ')}).`
          : 'Nothing to persist — no matching profile field and answer bank skipped this question.',
        savedProfile,
        savedBank
      }
    }
  )

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
