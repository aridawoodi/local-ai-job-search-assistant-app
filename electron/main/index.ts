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
import { searchJobs } from '../../src/modules/search'
import { matchJobs } from '../../src/modules/match'
import { notifyBestFits } from '../../src/modules/notify'
import { applyToJobs } from '../../src/modules/apply'
import {
  parseExtensionExport,
  skipExtensionImportMessage
} from '../../src/modules/import'
import type { JobListing, PipelineStatus } from '../../src/shared/types'

let mainWindow: BrowserWindow | null = null
let pipelineStatus: PipelineStatus = {
  stage: 'idle',
  message: 'Ready',
  updatedAt: new Date().toISOString()
}

function setStatus(stage: PipelineStatus['stage'], message: string): void {
  pipelineStatus = { stage, message, updatedAt: new Date().toISOString() }
}

function sampleFixturePath(): string {
  // Dev: project fixtures/; packaged: resources path
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

function registerIpc(): void {
  ipcMain.handle('prefs:get', () => loadPreferences())
  ipcMain.handle('prefs:set', (_e, partial) => updatePreferences(partial))
  ipcMain.handle('profile:get', () => loadProfileBundle())
  ipcMain.handle('pipeline:status', () => pipelineStatus)

  ipcMain.handle('pipeline:search', async () => {
    setStatus('search', 'Searching job sources via browser (stub)…')
    const prefs = loadPreferences()
    const jobs = await searchJobs(prefs)
    setStatus('idle', `Search stub returned ${jobs.length} listing(s).`)
    return jobs
  })

  ipcMain.handle('pipeline:match', async (_e, jobs: JobListing[]) => {
    setStatus('match', 'Matching against profile (stub)…')
    const prefs = loadPreferences()
    const results = await matchJobs(jobs, prefs)
    setStatus('idle', `Match stub scored ${results.length} job(s).`)
    return results
  })

  ipcMain.handle('pipeline:notify', async (_e, matches) => {
    setStatus('notify', 'Sending desktop notifications…')
    const result = await notifyBestFits(matches, (title, body) => {
      if (Notification.isSupported()) {
        new Notification({ title, body }).show()
      }
    })
    setStatus('idle', `Notified ${result.notified} best-fit job(s).`)
    return result
  })

  ipcMain.handle('pipeline:apply', async (_e, jobIds: string[]) => {
    setStatus('apply', 'Apply workflow (stub)…')
    const prefs = loadPreferences()
    const results = await applyToJobs(jobIds, prefs)
    setStatus('idle', 'Apply stub complete.')
    return results
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
  if (process.platform !== 'darwin') app.quit()
})
