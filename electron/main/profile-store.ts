import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { emptyBundle, type StoredProfileBundle } from '../../src/shared/profile'
import { parseApplications } from '../../src/modules/tracker'

function storeDir(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function profilePath(): string {
  return join(storeDir(), 'profile-bundle.json')
}

export function loadProfileBundle(): StoredProfileBundle {
  try {
    const raw = readFileSync(profilePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoredProfileBundle
    const empty = emptyBundle()
    return {
      ...empty,
      ...parsed,
      profile: { ...empty.profile, ...parsed.profile },
      answerBank: parsed.answerBank ?? [],
      settings: { ...empty.settings, ...parsed.settings },
      applications: parseApplications(parsed.applications ?? [])
    }
  } catch {
    return emptyBundle()
  }
}

export function saveProfileBundle(bundle: StoredProfileBundle): StoredProfileBundle {
  writeFileSync(profilePath(), JSON.stringify(bundle, null, 2), 'utf8')
  return bundle
}

export function clearProfileBundle(): StoredProfileBundle {
  const empty = emptyBundle()
  return saveProfileBundle(empty)
}
