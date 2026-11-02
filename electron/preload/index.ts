import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../../src/shared/ipc'
import type { AppPreferences } from '../../src/shared/preferences'
import type { JobListing, MatchResult } from '../../src/shared/types'

const api: DesktopApi = {
  getPreferences: () => ipcRenderer.invoke('prefs:get'),
  setPreferences: (partial: Partial<AppPreferences>) =>
    ipcRenderer.invoke('prefs:set', partial),
  getProfile: () => ipcRenderer.invoke('profile:get'),
  getPipelineStatus: () => ipcRenderer.invoke('pipeline:status'),
  runSearch: () => ipcRenderer.invoke('pipeline:search'),
  runMatch: (jobs: JobListing[]) => ipcRenderer.invoke('pipeline:match', jobs),
  notifyBestFits: (matches: MatchResult[]) =>
    ipcRenderer.invoke('pipeline:notify', matches),
  runApply: (jobIds: string[]) => ipcRenderer.invoke('pipeline:apply', jobIds),
  importExtensionProfile: () => ipcRenderer.invoke('import:extension'),
  importSampleProfile: () => ipcRenderer.invoke('import:sample'),
  skipExtensionImport: () => ipcRenderer.invoke('import:skip'),
  checkOllama: () => ipcRenderer.invoke('ollama:check'),
  completeOnboarding: () => ipcRenderer.invoke('onboarding:complete')
}

contextBridge.exposeInMainWorld('desktopApi', api)
