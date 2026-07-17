import type { InjectionKey } from 'vue'
import type { PlaylistTrack } from '~/components/playlist/types'
import { playlistRowId } from '#shared/myo-editor/playlistRowId'
import type { SaveJobPhase } from '#shared/myo-editor/types'
import type { YotoMyoCard } from '~/components/yoto-myo/types'
import { cardToPlaylist } from './cardToPlaylist'
import {
  addPersistedSave,
  readPersistedSaves,
  removePersistedSave,
} from './saveJobPersistence'
import type { SaveJobState, YotoCardDetail } from './types'
import { getPlaylistPreflightLimitError } from '#shared/myo-editor/yotoMyoLimits'

export interface SaveProgress {
  phase: SaveJobState['status']
  progress: number
  operationProgress: number
  error?: string
  tracks: SaveJobState['tracks']
}

export interface CardSaveSnapshot {
  playlist: PlaylistTrack[]
  baseline: PlaylistTrack[]
  cardTitle: string
}

export interface CardSaveState {
  cardId: string
  jobId: string
  status: SaveJobPhase
  progress: number
  operationProgress: number
  tracks: SaveJobState['tracks']
  error?: string
  snapshot: CardSaveSnapshot
  startedAt: number
}

export interface MyoEditorContext {
  selectedCardId: Ref<string | null>
  cardTitle: Ref<string>
  playlist: Ref<PlaylistTrack[]>
  isEditing: ComputedRef<boolean>
  isPodcast: Ref<boolean>
  loading: Ref<boolean>
  updating: ComputedRef<boolean>
  isPlaylistLocked: ComputedRef<boolean>
  saveProgress: ComputedRef<SaveProgress | null>
  errorMessage: Ref<string>
  isDirty: ComputedRef<boolean>
  isCardSaving: (cardId: string) => boolean
  selectCard: (card: YotoMyoCard) => Promise<void>
  clearSelection: (force?: boolean) => boolean
  resetChanges: () => void
  updateCard: (options?: { acknowledgeCapacityRisk?: boolean }) => Promise<void>
}

export const MYO_EDITOR_KEY: InjectionKey<MyoEditorContext> = Symbol('myoEditor')

function playlistSnapshot(playlist: PlaylistTrack[]): string {
  return JSON.stringify(playlist.map(playlistRowId))
}

function clonePlaylist(playlist: PlaylistTrack[]): PlaylistTrack[] {
  return playlist.map(item => ({ ...item }))
}

function cloneSnapshot(snapshot: CardSaveSnapshot): CardSaveSnapshot {
  return {
    cardTitle: snapshot.cardTitle,
    playlist: clonePlaylist(snapshot.playlist),
    baseline: clonePlaylist(snapshot.baseline),
  }
}

function isTerminalStatus(status: SaveJobPhase): boolean {
  return status === 'complete' || status === 'failed'
}

function jobToSaveProgress(state: CardSaveState): SaveProgress {
  return {
    phase: state.status,
    progress: state.progress,
    operationProgress: state.operationProgress,
    error: state.error,
    tracks: state.tracks,
  }
}

function saveStateFromJob(
  cardId: string,
  job: SaveJobState,
  snapshot: CardSaveSnapshot,
  startedAt: number,
): CardSaveState {
  return {
    cardId,
    jobId: job.id,
    status: job.status,
    progress: monotonicOverallProgress(cardId, job.progress),
    operationProgress: job.operationProgress ?? 0,
    error: job.error,
    tracks: job.tracks,
    snapshot,
    startedAt,
  }
}

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 30 * 60 * 1000
const MIN_COMPLETE_DISPLAY_MS = 450

const pollingJobIds = new Set<string>()
const maxOverallProgressByCard = new Map<string, number>()

function monotonicOverallProgress(cardId: string, next: number): number {
  const prev = maxOverallProgressByCard.get(cardId) ?? 0
  const value = Math.max(prev, Math.min(100, Math.round(next)))
  maxOverallProgressByCard.set(cardId, value)
  return value
}

function clearProgressTracking(cardId: string) {
  maxOverallProgressByCard.delete(cardId)
}

export function useMyoEditor() {
  const { playEvent } = useUiSound()
  const selectedCardId = ref<string | null>(null)
  const cardTitle = ref('')
  const playlist = ref<PlaylistTrack[]>([])
  const baselinePlaylist = ref<PlaylistTrack[]>([])
  const originalCardDetail = ref<YotoCardDetail | null>(null)
  const isPodcast = ref(false)
  const loading = ref(false)
  const errorMessage = ref('')
  const activeSaves = ref(new Map<string, CardSaveState>())

  function touchActiveSaves() {
    activeSaves.value = new Map(activeSaves.value)
  }

  function getSaveState(cardId: string): CardSaveState | undefined {
    return activeSaves.value.get(cardId)
  }

  function setSaveState(cardId: string, state: CardSaveState) {
    activeSaves.value.set(cardId, state)
    touchActiveSaves()
  }

  function deleteSaveState(cardId: string) {
    if (!activeSaves.value.has(cardId)) return
    activeSaves.value.delete(cardId)
    clearProgressTracking(cardId)
    touchActiveSaves()
  }

  function isCardSaving(cardId: string): boolean {
    const state = getSaveState(cardId)
    return Boolean(state && !isTerminalStatus(state.status))
  }

  const isEditing = computed(() => Boolean(selectedCardId.value))

  const isDirty = computed(
    () => playlistSnapshot(playlist.value) !== playlistSnapshot(baselinePlaylist.value),
  )

  const selectedSaveState = computed(() => {
    const cardId = selectedCardId.value
    if (!cardId) return null
    return getSaveState(cardId) ?? null
  })

  const isPlaylistLocked = computed(() => {
    const state = selectedSaveState.value
    return Boolean(state && !isTerminalStatus(state.status))
  })

  const updating = computed(() => isPlaylistLocked.value)

  const saveProgress = computed<SaveProgress | null>(() => {
    const state = selectedSaveState.value
    if (!state || isTerminalStatus(state.status)) return null
    return jobToSaveProgress(state)
  })

  function restoreSnapshot(snapshot: CardSaveSnapshot) {
    playlist.value = clonePlaylist(snapshot.playlist)
    baselinePlaylist.value = clonePlaylist(snapshot.baseline)
    cardTitle.value = snapshot.cardTitle
  }

  async function reloadCardFromApi(cardId: string, titleFallback?: string) {
    const detail = await $fetch<YotoCardDetail>(`/api/yoto/content/${cardId}`)
    originalCardDetail.value = detail
    const result = await cardToPlaylist(detail)
    isPodcast.value = result.isPodcast
    playlist.value = result.tracks
    baselinePlaylist.value = clonePlaylist(playlist.value)
    cardTitle.value = titleFallback || detail.title
  }

  async function finalizeSaveSuccess(cardId: string, titleFallback?: string) {
    const isSelected = selectedCardId.value === cardId
    const displayStartedAt = Date.now()

    if (isSelected) {
      const existing = getSaveState(cardId)
      if (existing) {
        setSaveState(cardId, {
          ...existing,
          status: 'posting',
          progress: monotonicOverallProgress(cardId, 100),
          operationProgress: 100,
          tracks: existing.tracks.map(track => ({
            ...track,
            status: track.status === 'failed' ? 'failed' : 'ready',
          })),
        })
      }
      await nextTick()
    }

    if (isSelected) {
      try {
        await reloadCardFromApi(cardId, titleFallback)
        errorMessage.value = ''
        await nextTick()
      }
      catch (err: unknown) {
        const e = err as { statusMessage?: string; message?: string }
        errorMessage.value = e.statusMessage ?? e.message ?? 'Failed to reload card after save'
      }
    }

    if (isSelected) {
      const remaining = MIN_COMPLETE_DISPLAY_MS - (Date.now() - displayStartedAt)
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining))
      }
    }

    if (isSelected) {
      playEvent('saveComplete')
    }

    deleteSaveState(cardId)
    removePersistedSave(cardId)
  }

  function handleSaveFailed(cardId: string, message: string) {
    playEvent('saveError')
    const displayMessage = message.length > 240 ? `${message.slice(0, 237)}…` : message
    deleteSaveState(cardId)
    removePersistedSave(cardId)

    if (selectedCardId.value === cardId) {
      errorMessage.value = displayMessage
    }
  }

  function updateSaveStateFromJob(cardId: string, job: SaveJobState) {
    const existing = getSaveState(cardId)
    if (!existing) return

    const isComplete = job.status === 'complete'

    setSaveState(cardId, {
      ...existing,
      status: isComplete ? 'posting' : job.status,
      progress: monotonicOverallProgress(
        cardId,
        isComplete ? 100 : job.progress,
      ),
      operationProgress: isComplete ? 100 : (job.operationProgress ?? existing.operationProgress),
      error: job.error,
      tracks: job.tracks,
    })
  }

  async function pollSaveJob(cardId: string, jobId: string, titleFallback: string) {
    if (pollingJobIds.has(jobId)) return
    pollingJobIds.add(jobId)

    const existing = getSaveState(cardId)
    const startedAt = existing?.startedAt ?? Date.now()

    try {
      let job = await $fetch<SaveJobState>(`/api/yoto/jobs/${jobId}`)
      updateSaveStateFromJob(cardId, job)

      while (!isTerminalStatus(job.status)) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          handleSaveFailed(cardId, 'Save timed out. Check your card in Yoto and try again.')
          return
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        job = await $fetch<SaveJobState>(`/api/yoto/jobs/${jobId}`)
        updateSaveStateFromJob(cardId, job)
      }

      if (job.status === 'failed') {
        handleSaveFailed(cardId, job.error ?? 'Save failed')
        return
      }

      await finalizeSaveSuccess(cardId, titleFallback)
    }
    catch (err: unknown) {
      const e = err as { statusCode?: number; statusMessage?: string; message?: string }
      if (e.statusCode === 404) {
        deleteSaveState(cardId)
        removePersistedSave(cardId)
        return
      }
      handleSaveFailed(
        cardId,
        e.statusMessage ?? e.message ?? 'Failed to track save progress',
      )
    }
    finally {
      pollingJobIds.delete(jobId)
    }
  }

  async function startSaveJob(
    cardId: string,
    snapshot: CardSaveSnapshot,
    options?: { acknowledgeCapacityRisk?: boolean },
  ) {
    const { jobId } = await $fetch<{ jobId: string }>(
      `/api/yoto/content/${cardId}/save`,
      {
        method: 'POST',
        body: {
          playlist: snapshot.playlist,
          baselinePlaylist: snapshot.baseline,
          cardTitle: snapshot.cardTitle,
          acknowledgeCapacityRisk: options?.acknowledgeCapacityRisk === true,
        },
      },
    )

    const startedAt = Date.now()
    const initialState: CardSaveState = {
      cardId,
      jobId,
      status: 'planning',
      progress: 0,
      operationProgress: 0,
      tracks: [],
      snapshot: cloneSnapshot(snapshot),
      startedAt,
    }
    maxOverallProgressByCard.set(cardId, 0)
    setSaveState(cardId, initialState)
    addPersistedSave(cardId, jobId)

    void pollSaveJob(cardId, jobId, snapshot.cardTitle)
  }

  async function hydratePersistedSaves() {
    const persisted = readPersistedSaves()

    for (const [cardId, { jobId, startedAt }] of Object.entries(persisted)) {
      if (getSaveState(cardId)) continue

      try {
        const job = await $fetch<SaveJobState>(`/api/yoto/jobs/${jobId}`)

        if (isTerminalStatus(job.status)) {
          removePersistedSave(cardId)
          if (job.status === 'failed' && selectedCardId.value === cardId) {
            errorMessage.value = job.error ?? 'Save failed'
          }
          if (job.status === 'complete' && selectedCardId.value === cardId) {
            await finalizeSaveSuccess(cardId)
          }
          continue
        }

        const placeholderSnapshot: CardSaveSnapshot = {
          playlist: [],
          baseline: [],
          cardTitle: '',
        }
        setSaveState(
          cardId,
          saveStateFromJob(cardId, job, placeholderSnapshot, startedAt),
        )

        if (selectedCardId.value === cardId) {
          errorMessage.value = ''
        }

        void pollSaveJob(cardId, jobId, '')
      }
      catch (err: unknown) {
        const e = err as { statusCode?: number }
        if (e.statusCode === 404) {
          removePersistedSave(cardId)
        }
      }
    }
  }

  async function selectCard(card: YotoMyoCard) {
    if (loading.value) return

    const currentCardId = selectedCardId.value
    const currentCardSaving = currentCardId ? isCardSaving(currentCardId) : false

    if (currentCardId && isDirty.value && !currentCardSaving) {
      const confirmed = window.confirm(
        'You have unsaved playlist changes. Switch cards anyway?',
      )
      if (!confirmed) return
    }

    if (selectedCardId.value === card.cardId && !errorMessage.value) {
      return
    }

    loading.value = true
    errorMessage.value = ''
    selectedCardId.value = card.cardId
    cardTitle.value = card.title

    const inFlightSave = getSaveState(card.cardId)
    if (inFlightSave && !isTerminalStatus(inFlightSave.status)) {
      if (inFlightSave.snapshot.playlist.length > 0) {
        restoreSnapshot(inFlightSave.snapshot)
        isPodcast.value = false
        loading.value = false
        return
      }

      try {
        await reloadCardFromApi(card.cardId, card.title)
      }
      catch (err: unknown) {
        const e = err as { statusMessage?: string; message?: string }
        errorMessage.value = e.statusMessage ?? e.message ?? 'Failed to load card'
        isPodcast.value = false
        playlist.value = []
        baselinePlaylist.value = []
        originalCardDetail.value = null
      }
      finally {
        loading.value = false
      }
      return
    }

    try {
      await reloadCardFromApi(card.cardId, card.title)
    }
    catch (err: unknown) {
      const e = err as { statusMessage?: string; message?: string }
      errorMessage.value = e.statusMessage ?? e.message ?? 'Failed to load card'
      isPodcast.value = false
      playlist.value = []
      baselinePlaylist.value = []
      originalCardDetail.value = null
    }
    finally {
      loading.value = false
    }
  }

  function clearSelection(force = false): boolean {
    const currentCardId = selectedCardId.value
    const currentCardSaving = currentCardId ? isCardSaving(currentCardId) : false

    if (!force && isDirty.value && !currentCardSaving) {
      const confirmed = window.confirm(
        'You have unsaved playlist changes. Clear selection anyway?',
      )
      if (!confirmed) return false
    }

    selectedCardId.value = null
    cardTitle.value = ''
    isPodcast.value = false
    playlist.value = []
    baselinePlaylist.value = []
    originalCardDetail.value = null
    errorMessage.value = ''
    return true
  }

  function resetChanges() {
    if (!isDirty.value || isPlaylistLocked.value) return
    playlist.value = clonePlaylist(baselinePlaylist.value)
    errorMessage.value = ''
  }

  async function updateCard(options?: { acknowledgeCapacityRisk?: boolean }) {
    const cardId = selectedCardId.value
    if (!cardId || !isDirty.value || loading.value || isPlaylistLocked.value) return

    if (isPodcast.value) {
      errorMessage.value = 'Podcast cards cannot be edited yet.'
      return
    }

    if (!options?.acknowledgeCapacityRisk) {
      const limitError = getPlaylistPreflightLimitError(playlist.value)
      if (limitError) {
        errorMessage.value = limitError
        playEvent('saveError')
        return
      }
    }

    errorMessage.value = ''

    const snapshot: CardSaveSnapshot = {
      playlist: clonePlaylist(playlist.value),
      baseline: clonePlaylist(baselinePlaylist.value),
      cardTitle: cardTitle.value,
    }

    try {
      await startSaveJob(cardId, snapshot, {
        acknowledgeCapacityRisk: options?.acknowledgeCapacityRisk === true,
      })
    }
    catch (err: unknown) {
      const e = err as { statusMessage?: string; message?: string }
      errorMessage.value = e.statusMessage ?? e.message ?? 'Failed to update card'
    }
  }

  onMounted(() => {
    void hydratePersistedSaves()
  })

  return {
    selectedCardId,
    cardTitle,
    playlist,
    isEditing,
    isPodcast,
    loading,
    updating,
    isPlaylistLocked,
    saveProgress,
    errorMessage,
    isDirty,
    isCardSaving,
    selectCard,
    clearSelection,
    resetChanges,
    updateCard,
  }
}
