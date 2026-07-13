const STORAGE_KEY = 'yoto-cards:active-saves'

export interface PersistedSaveJob {
  jobId: string
  startedAt: number
}

export type PersistedSaves = Record<string, PersistedSaveJob>

export function readPersistedSaves(): PersistedSaves {
  if (typeof sessionStorage === 'undefined') return {}

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedSaves
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  catch {
    return {}
  }
}

export function writePersistedSaves(saves: PersistedSaves): void {
  if (typeof sessionStorage === 'undefined') return

  if (Object.keys(saves).length === 0) {
    sessionStorage.removeItem(STORAGE_KEY)
    return
  }

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saves))
}

export function addPersistedSave(cardId: string, jobId: string): void {
  const saves = readPersistedSaves()
  saves[cardId] = { jobId, startedAt: Date.now() }
  writePersistedSaves(saves)
}

export function removePersistedSave(cardId: string): void {
  const saves = readPersistedSaves()
  if (!(cardId in saves)) return
  delete saves[cardId]
  writePersistedSaves(saves)
}
