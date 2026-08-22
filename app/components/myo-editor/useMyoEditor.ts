import type { InjectionKey } from 'vue'
import type { PlaylistTrack } from '~/components/playlist/types'
import { playlistRowId } from '#shared/myo-editor/playlistRowId'
import { applyTrackIcon, resolveTrackIcon, mediaIdFromIcon16x16 } from '#shared/myo-editor/trackArt'
import { isPersistedCardTrack } from '#shared/myo-editor/patchCardIcon'
import type { SaveJobPhase } from '#shared/myo-editor/types'
import type { YotoMyoCard } from '~/components/yoto-myo/types'
import { cardToPlaylist } from './cardToPlaylist'
import {
  addPersistedSave,
  readPersistedSaves,
  removePersistedSave,
} from './saveJobPersistence'
import {
  readPersistedDrafts,
  readPodcastCardIds,
  writePersistedDrafts,
  writePodcastCardIds,
} from './draftPersistence'
import type { SaveJobState, YotoCardDetail } from './types'
import { getPlaylistCapacitySnapshot, getPlaylistPreflightLimitError } from '#shared/myo-editor/yotoMyoLimits'
import {
  applySourceTrimAndSplit,
  blockIndexForTrack,
  playlistBlocks,
  selectIncomingTracks,
  snapInsertTrackIndex,
  splitSourceDuration,
  trackIndexForBlock,
} from '#shared/myo-editor/splitTrack'
import {
  collectPendingUpdateTargets,
  pendingTargetFrom,
  planPendingUpdates,
  type PendingUpdateTarget,
} from '#shared/myo-editor/planPendingUpdates'
import {
  canAcceptPlaylistTracks,
  classifyCreateStartFailure,
  getStandalonePlaylistCreateError,
  getStandalonePlaylistValidationError,
  isPlaylistEditorActive,
  NEW_PLAYLIST_SAVE_KEY,
  notifyConfirmedPlaylistCreated,
  resolveClientSaveTarget,
  resolveSavedCardId,
  UNNAMED_PLAYLIST_ADD_MESSAGE,
  type ClientSaveTarget,
} from '#shared/myo-editor/standalonePlaylist'
import {
  SAVE_JOB_LOST_MESSAGE,
  savePollHitCeiling,
  savePollIsSlowWait,
  saveProgressStamp,
  shouldAbandonClientPoll,
} from '#shared/myo-editor/savePoll'
import type { PlaylistArtworkSpec } from '#shared/myo-editor/playlistArtwork'

export type UpdatePromptKind = 'capacity' | 'normalize'
export type UpdatePromptSurface = 'footer' | 'dialog'
export type PlaylistManagePrompt = 'rename' | 'delete'
type UpdatePromptScope = 'selected' | 'pending'

export interface SaveProgress {
  phase: SaveJobState['status']
  progress: number
  operationProgress: number
  error?: string
  tracks: SaveJobState['tracks']
  /** True when progress has not moved for a while; overlay stays up. */
  slowWait?: boolean
}

export interface CardSaveSnapshot {
  playlist: PlaylistTrack[]
  baseline: PlaylistTrack[]
  cardTitle: string
}

export interface CardSaveState {
  saveKey: string
  cardId?: string
  jobId: string
  status: SaveJobPhase
  progress: number
  operationProgress: number
  tracks: SaveJobState['tracks']
  error?: string
  snapshot: CardSaveSnapshot
  startedAt: number
  slowWait?: boolean
}

export type InsertTracksResult =
  | { ok: true, added: number, skipped: number, overflow: number, firstAddedId?: string }
  | { ok: false, message: string }

export interface UseMyoEditorOptions {
  onPlaylistCreated?: (cardId: string) => void
  onPlaylistRenamed?: (cardId: string, title: string) => void
  onPlaylistDeleted?: (cardId: string) => void
  onPlaylistCoverChanged?: (cardId: string, coverUrl: string) => void
  onPlaylistSaved?: (cardId: string, stats: {
    duration: number
    trackCount: number
    title?: string
  }) => void
}

export interface MyoEditorContext {
  selectedCardId: Ref<string | null>
  isNewPlaylist: Ref<boolean>
  createOutcomeUncertain: Ref<boolean>
  showUncertainCreateCover: ComputedRef<boolean>
  dismissUncertainCreateCover: () => void
  cardTitle: Ref<string>
  playlist: Ref<PlaylistTrack[]>
  isEditing: ComputedRef<boolean>
  canAcceptTracks: ComputedRef<boolean>
  isPodcast: Ref<boolean>
  loading: Ref<boolean>
  updating: ComputedRef<boolean>
  isPlaylistLocked: ComputedRef<boolean>
  /** True while any card save job is still running (not just the selected card). */
  hasActiveSaves: ComputedRef<boolean>
  /** Overall % of the most relevant in-flight save (selected first, else max). */
  activeSaveProgress: ComputedRef<number | null>
  saveProgress: ComputedRef<SaveProgress | null>
  errorMessage: Ref<string>
  isDirty: ComputedRef<boolean>
  pendingPlaylistUpdateCount: ComputedRef<number>
  /** Card ids with stashed unpublished drafts (not including the live selection). */
  pendingDraftCardIds: ComputedRef<string[]>
  /** Title for a single pending update (live dirty card, else first stash). */
  pendingUpdateTitle: ComputedRef<string>
  /** How many playlists the current capacity/normalize prompt applies to. */
  updatePromptCardCount: Ref<number>
  isCardSaving: (cardId: string) => boolean
  isKnownPodcast: (cardId: string) => boolean
  selectCard: (card: YotoMyoCard) => Promise<void>
  startNewPlaylist: () => boolean
  queuePendingCreateTracks: (tracks: PlaylistTrack[]) => void
  pendingCreateTrackCount: ComputedRef<number>
  confirmNewPlaylistName: (title: string) => Promise<boolean>
  appendTracks: (tracks: PlaylistTrack[]) => InsertTracksResult
  insertTracks: (tracks: PlaylistTrack[], atIndex?: number) => InsertTracksResult
  clearSelection: (force?: boolean) => boolean
  resetChanges: () => void
  /** Start Update for the selected card: capacity, then normalize if extracting, then save. */
  requestUpdate: (surface?: UpdatePromptSurface) => void
  /** Start Update for every pending dirty playlist without requiring a selected card. */
  requestUpdatePending: (surface?: UpdatePromptSurface) => void
  cancelUpdatePrompt: () => void
  confirmUpdatePrompt: () => void
  keepVolumeAsIs: () => void
  updatePrompt: Ref<UpdatePromptKind | null>
  updatePromptSurface: Ref<UpdatePromptSurface | null>
  /** True after Normalize / Keep as-is until the save overlay owns the playlist. */
  saveStarting: Ref<boolean>
  updateCard: (options?: { acknowledgeCapacityRisk?: boolean, normalizeVolume?: boolean }) => Promise<void>
  setTrackArt: (trackId: string, icon16x16: string, previewUrl: string) => void
  /** Local apply + optional instant icon patch for tracks already on the saved card. */
  persistTrackArt: (
    trackId: string,
    icon16x16: string,
    previewUrl: string,
  ) => Promise<{ patched: boolean; error?: string }>
  setTrackTrim: (trackId: string, trim: PlaylistTrack['trim'] | null) => void
  playlistManagePrompt: Ref<PlaylistManagePrompt | null>
  playlistManageBusy: Ref<boolean>
  playlistArtworkOpen: Ref<boolean>
  playlistCoverUrl: ComputedRef<string | null>
  startRename: () => boolean
  startDelete: () => boolean
  startArtwork: () => boolean
  closeArtwork: () => void
  cancelPlaylistManage: () => void
  confirmRename: (title: string) => Promise<boolean>
  confirmDelete: () => Promise<boolean>
  confirmArtwork: (spec: PlaylistArtworkSpec) => Promise<boolean>
  confirmArtworkUpload: (file: Blob) => Promise<boolean>
}

export const MYO_EDITOR_KEY: InjectionKey<MyoEditorContext> = Symbol('myoEditor')

function playlistSnapshot(playlist: PlaylistTrack[]): string {
  return JSON.stringify(playlist.map(track => ({
    id: playlistRowId(track),
    icon: resolveTrackIcon(track).icon16x16,
    trim: track.trim
      ? [track.trim.startSeconds, track.trim.endSeconds]
      : null,
  })))
}

function clonePlaylist(playlist: PlaylistTrack[]): PlaylistTrack[] {
  return playlist.map(item => ({
    ...item,
    chapterDisplay: item.chapterDisplay ? { ...item.chapterDisplay } : item.chapterDisplay,
    yotoReuse: item.yotoReuse
      ? {
          ...item.yotoReuse,
          display: item.yotoReuse.display ? { ...item.yotoReuse.display } : item.yotoReuse.display,
        }
      : item.yotoReuse,
    split: item.split ? { ...item.split } : item.split,
    trim: item.trim ? { ...item.trim } : item.trim,
  }))
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
    slowWait: state.slowWait,
  }
}

function saveStateFromJob(
  saveKey: string,
  job: SaveJobState,
  snapshot: CardSaveSnapshot,
  startedAt: number,
): CardSaveState {
  return {
    saveKey,
    cardId: job.cardId,
    jobId: job.id,
    status: job.status,
    progress: monotonicOverallProgress(saveKey, job.progress),
    operationProgress: job.operationProgress ?? 0,
    error: job.error,
    tracks: job.tracks,
    snapshot,
    startedAt,
  }
}

const POLL_INTERVAL_MS = 1000
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

export function useMyoEditor(options: UseMyoEditorOptions = {}) {
  const { playEvent } = useUiSound()
  const selectedCardId = ref<string | null>(null)
  const isNewPlaylist = ref(false)
  const createOutcomeUncertain = ref(false)
  const uncertainCreateCoverDismissed = ref(false)
  const cardTitle = ref('')
  const playlist = ref<PlaylistTrack[]>([])
  const baselinePlaylist = ref<PlaylistTrack[]>([])
  const originalCardDetail = ref<YotoCardDetail | null>(null)
  const isPodcast = ref(false)
  const loading = ref(false)
  const errorMessage = ref('')

  function setCreateOutcomeUncertain(value: boolean) {
    if (value) uncertainCreateCoverDismissed.value = false
    createOutcomeUncertain.value = value
  }
  const activeSaves = ref(new Map<string, CardSaveState>())
  const pendingDrafts = ref(new Map<string, CardSaveSnapshot>())
  const pendingCreateTracks = ref<PlaylistTrack[]>([])
  const podcastCardIds = ref(new Set<string>(readPodcastCardIds()))

  function touchActiveSaves() {
    activeSaves.value = new Map(activeSaves.value)
  }

  function persistPodcastCardIds() {
    writePodcastCardIds([...podcastCardIds.value])
  }

  function rememberPodcastStatus(cardId: string, podcast: boolean) {
    const known = podcastCardIds.value.has(cardId)
    if (podcast && !known) {
      podcastCardIds.value.add(cardId)
      podcastCardIds.value = new Set(podcastCardIds.value)
      persistPodcastCardIds()
    }
    else if (!podcast && known) {
      podcastCardIds.value.delete(cardId)
      podcastCardIds.value = new Set(podcastCardIds.value)
      persistPodcastCardIds()
    }
  }

  function isKnownPodcast(cardId: string): boolean {
    return podcastCardIds.value.has(cardId)
  }

  function buildPersistedDrafts(): Record<string, CardSaveSnapshot> {
    const out: Record<string, CardSaveSnapshot> = {}
    for (const [cardId, snapshot] of pendingDrafts.value) {
      out[cardId] = {
        playlist: clonePlaylist(snapshot.playlist),
        baseline: clonePlaylist(snapshot.baseline),
        cardTitle: snapshot.cardTitle,
      }
    }
    const selectedId = selectedCardId.value
    if (isNewPlaylist.value) {
      if (playlist.value.length > 0 || cardTitle.value.trim()) {
        out[NEW_PLAYLIST_SAVE_KEY] = {
          playlist: clonePlaylist(playlist.value),
          baseline: clonePlaylist(baselinePlaylist.value),
          cardTitle: cardTitle.value,
        }
      }
    }
    else if (selectedId && isDirty.value && !isPodcast.value) {
      out[selectedId] = {
        playlist: clonePlaylist(playlist.value),
        baseline: clonePlaylist(baselinePlaylist.value),
        cardTitle: cardTitle.value,
      }
    }
    return out
  }

  const DRAFT_PERSIST_DEBOUNCE_MS = 400
  let draftPersistTimer: ReturnType<typeof setTimeout> | null = null

  /** Immediate localStorage write — cancel any pending debounced persist first. */
  function persistPendingDrafts() {
    if (draftPersistTimer) {
      clearTimeout(draftPersistTimer)
      draftPersistTimer = null
    }
    writePersistedDrafts(buildPersistedDrafts())
  }

  /** Coalesce rapid playlist edits (drag-reorder, batch adds) into one write. */
  function schedulePersistPendingDrafts() {
    if (import.meta.server) return
    if (draftPersistTimer) clearTimeout(draftPersistTimer)
    draftPersistTimer = setTimeout(() => {
      draftPersistTimer = null
      writePersistedDrafts(buildPersistedDrafts())
    }, DRAFT_PERSIST_DEBOUNCE_MS)
  }

  function touchPendingDrafts() {
    pendingDrafts.value = new Map(pendingDrafts.value)
    persistPendingDrafts()
  }

  function getSaveState(saveKey: string): CardSaveState | undefined {
    return activeSaves.value.get(saveKey)
  }

  function setSaveState(saveKey: string, state: CardSaveState) {
    activeSaves.value.set(saveKey, state)
    touchActiveSaves()
  }

  function deleteSaveState(saveKey: string) {
    if (!activeSaves.value.has(saveKey)) return
    activeSaves.value.delete(saveKey)
    clearProgressTracking(saveKey)
    touchActiveSaves()
  }

  function clearPendingDraft(cardId: string) {
    if (!pendingDrafts.value.has(cardId)) {
      persistPendingDrafts()
      return
    }
    pendingDrafts.value.delete(cardId)
    touchPendingDrafts()
  }

  function stashCurrentDraft(cardId: string) {
    if (!isDirty.value || isPodcast.value) {
      clearPendingDraft(cardId)
      return
    }
    pendingDrafts.value.set(cardId, {
      playlist: clonePlaylist(playlist.value),
      baseline: clonePlaylist(baselinePlaylist.value),
      cardTitle: cardTitle.value,
    })
    touchPendingDrafts()
  }

  function isCardSaving(cardId: string): boolean {
    const state = getSaveState(cardId)
    return Boolean(state && !isTerminalStatus(state.status))
  }

  function hydratePersistedDrafts() {
    const stored = readPersistedDrafts()
    const next = new Map<string, CardSaveSnapshot>()
    for (const [cardId, snapshot] of Object.entries(stored)) {
      const cloned = {
        playlist: clonePlaylist(snapshot.playlist),
        baseline: clonePlaylist(snapshot.baseline),
        cardTitle: snapshot.cardTitle,
      }
      if (cardId === NEW_PLAYLIST_SAVE_KEY) {
        isNewPlaylist.value = true
        selectedCardId.value = null
        restoreSnapshot(cloned)
        continue
      }
      next.set(cardId, cloned)
    }
    pendingDrafts.value = next
  }

  const selectedSaveKey = computed(() =>
    isNewPlaylist.value ? NEW_PLAYLIST_SAVE_KEY : selectedCardId.value,
  )

  const isEditing = computed(() =>
    isPlaylistEditorActive(selectedCardId.value, isNewPlaylist.value),
  )

  const isDirty = computed(() => {
    if (isNewPlaylist.value) {
      return playlist.value.length > 0
        || Boolean(cardTitle.value.trim())
        || pendingCreateTracks.value.length > 0
    }
    return playlistSnapshot(playlist.value) !== playlistSnapshot(baselinePlaylist.value)
  })

  const pendingPlaylistUpdateCount = computed(() => {
    let draftCount = 0
    for (const key of pendingDrafts.value.keys()) {
      if (key !== NEW_PLAYLIST_SAVE_KEY) draftCount++
    }
    if (isNewPlaylist.value) return draftCount
    const selectedId = selectedCardId.value
    const selectedIsDirty = Boolean(selectedId && isDirty.value)
    if (!selectedIsDirty) return draftCount
    return draftCount + (pendingDrafts.value.has(selectedId!) ? 0 : 1)
  })

  const pendingDraftCardIds = computed(() =>
    [...pendingDrafts.value.keys()].filter(id => id !== NEW_PLAYLIST_SAVE_KEY),
  )

  const pendingUpdateTitle = computed(() => {
    if (selectedCardId.value && isDirty.value && !isPodcast.value) {
      return cardTitle.value.trim()
    }
    for (const snapshot of pendingDrafts.value.values()) {
      const title = snapshot.cardTitle.trim()
      if (title) return title
    }
    return ''
  })

  const selectedSaveState = computed(() => {
    const saveKey = selectedSaveKey.value
    if (!saveKey) return null
    return getSaveState(saveKey) ?? null
  })

  const isPlaylistLocked = computed(() => {
    const state = selectedSaveState.value
    return Boolean(state && !isTerminalStatus(state.status))
  })

  const hasActiveSaves = computed(() => {
    for (const state of activeSaves.value.values()) {
      if (!isTerminalStatus(state.status)) return true
    }
    return false
  })

  const activeSaveProgress = computed(() => {
    const selectedKey = selectedSaveKey.value
    if (selectedKey) {
      const selected = getSaveState(selectedKey)
      if (selected && !isTerminalStatus(selected.status)) {
        return selected.progress
      }
    }
    let max = 0
    let any = false
    for (const state of activeSaves.value.values()) {
      if (!isTerminalStatus(state.status)) {
        any = true
        max = Math.max(max, state.progress)
      }
    }
    return any ? max : null
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

  async function reloadCardFromApi(
    cardId: string,
    titleFallback?: string,
    previousPlaylist?: PlaylistTrack[],
  ) {
    const detail = await $fetch<YotoCardDetail>(`/api/yoto/content/${cardId}`)
    originalCardDetail.value = detail
    const result = await cardToPlaylist(detail)
    isPodcast.value = result.isPodcast
    rememberPodcastStatus(cardId, result.isPodcast)

    // Keep working preview URLs from the pre-reload playlist when catalog lookup misses
    // (custom uploads sometimes lag in /user/me right after save).
    const previewByMediaId = new Map<string, string>()
    for (const track of previousPlaylist ?? []) {
      const icon = resolveTrackIcon(track).icon16x16
      const mediaId = mediaIdFromIcon16x16(icon)
      const preview = track.iconPreviewUrl?.trim()
      if (mediaId && preview && !preview.includes('media-secure.aws.fooropa.com')) {
        previewByMediaId.set(mediaId, preview)
      }
    }

    playlist.value = result.tracks.map((track) => {
      if (track.iconPreviewUrl?.trim()) return track
      const icon = resolveTrackIcon(track).icon16x16
      const mediaId = mediaIdFromIcon16x16(icon)
      const preview = mediaId ? previewByMediaId.get(mediaId) : undefined
      return preview ? { ...track, iconPreviewUrl: preview } : track
    })
    baselinePlaylist.value = clonePlaylist(playlist.value)
    cardTitle.value = titleFallback || detail.title
  }

  async function finalizeSaveSuccess(saveKey: string, titleFallback?: string) {
    const existing = getSaveState(saveKey)
    const createdCardId = existing?.cardId?.trim()
    const isCreate = saveKey === NEW_PLAYLIST_SAVE_KEY
    const cardId = isCreate
      ? resolveSavedCardId('create', null, createdCardId)
      : saveKey
    const isSelected = selectedSaveKey.value === saveKey
      || (isCreate && isNewPlaylist.value)
      || selectedCardId.value === cardId
    const displayStartedAt = Date.now()

    if (isCreate) {
      isNewPlaylist.value = false
      setCreateOutcomeUncertain(false)
      selectedCardId.value = cardId
      clearPendingDraft(NEW_PLAYLIST_SAVE_KEY)
      if (existing) {
        deleteSaveState(NEW_PLAYLIST_SAVE_KEY)
        removePersistedSave(NEW_PLAYLIST_SAVE_KEY)
        setSaveState(cardId, {
          ...existing,
          saveKey: cardId,
          cardId,
          status: 'posting',
          progress: monotonicOverallProgress(cardId, 100),
          operationProgress: 100,
        })
      }
      notifyConfirmedPlaylistCreated('create', cardId, options.onPlaylistCreated)
    }

    if (isSelected) {
      const state = getSaveState(cardId) ?? existing
      if (state) {
        setSaveState(cardId, {
          ...state,
          saveKey: cardId,
          cardId,
          status: 'posting',
          progress: monotonicOverallProgress(cardId, 100),
          operationProgress: 100,
          tracks: state.tracks.map(track => ({
            ...track,
            status: track.status === 'failed' ? 'failed' : 'ready',
          })),
        })
      }
      await nextTick()
    }

    if (isSelected) {
      try {
        const previousPlaylist = clonePlaylist(playlist.value)
        await reloadCardFromApi(cardId, titleFallback, previousPlaylist)
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

    const savedPlaylist = isSelected
      ? playlist.value
      : (existing?.snapshot.playlist ?? [])
    const savedTitle = isSelected
      ? cardTitle.value
      : (existing?.snapshot.cardTitle ?? titleFallback ?? '')
    const capacity = getPlaylistCapacitySnapshot(savedPlaylist)
    options.onPlaylistSaved?.(cardId, {
      duration: capacity.knownDurationSeconds,
      trackCount: capacity.trackCount,
      title: savedTitle,
    })

    deleteSaveState(cardId)
    removePersistedSave(cardId)
    clearPendingDraft(cardId)
  }

  function handleSaveFailed(saveKey: string, message: string, outcomeUncertain = false) {
    playEvent('saveError')
    const displayMessage = message.length > 420 ? `${message.slice(0, 417)}…` : message
    deleteSaveState(saveKey)
    removePersistedSave(saveKey)

    if (saveKey === NEW_PLAYLIST_SAVE_KEY && outcomeUncertain) {
      setCreateOutcomeUncertain(true)
    }

    if (selectedSaveKey.value === saveKey) {
      errorMessage.value = displayMessage
    }
  }

  function updateSaveStateFromJob(saveKey: string, job: SaveJobState) {
    const existing = getSaveState(saveKey)
    if (!existing) return

    const isComplete = job.status === 'complete'

    setSaveState(saveKey, {
      ...existing,
      cardId: job.cardId ?? existing.cardId,
      status: isComplete ? 'posting' : job.status,
      progress: monotonicOverallProgress(
        saveKey,
        isComplete ? 100 : job.progress,
      ),
      operationProgress: isComplete ? 100 : (job.operationProgress ?? existing.operationProgress),
      error: job.error,
      tracks: job.tracks,
    })
  }

  async function pollSaveJob(saveKey: string, jobId: string, titleFallback: string) {
    if (pollingJobIds.has(jobId)) return
    pollingJobIds.add(jobId)

    const existing = getSaveState(saveKey)
    const startedAt = existing?.startedAt ?? Date.now()
    let lastActivityAt = Date.now()
    let lastActivityStamp = ''

    function noteJobActivity(job: SaveJobState) {
      const stamp = saveProgressStamp(job)
      if (stamp !== lastActivityStamp) {
        lastActivityStamp = stamp
        lastActivityAt = Date.now()
      }
      const existing = getSaveState(saveKey)
      if (!existing) return
      const slowWait = savePollIsSlowWait(Date.now() - lastActivityAt)
      if (existing.slowWait === slowWait) return
      setSaveState(saveKey, { ...existing, slowWait })
    }

    try {
      let job = await $fetch<SaveJobState>(`/api/yoto/jobs/${jobId}`)
      updateSaveStateFromJob(saveKey, job)
      noteJobActivity(job)

      while (!isTerminalStatus(job.status)) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        job = await $fetch<SaveJobState>(`/api/yoto/jobs/${jobId}`)
        updateSaveStateFromJob(saveKey, job)
        noteJobActivity(job)

        if (!isTerminalStatus(job.status) && savePollHitCeiling(Date.now() - startedAt)) {
          const current = getSaveState(saveKey)
          if (current && !current.slowWait) {
            setSaveState(saveKey, { ...current, slowWait: true })
          }
        }
      }

      if (job.status === 'failed') {
        handleSaveFailed(saveKey, job.error ?? 'Save failed', job.outcomeUncertain === true)
        return
      }

      await finalizeSaveSuccess(saveKey, titleFallback)
    }
    catch (err: unknown) {
      const e = err as { statusCode?: number; statusMessage?: string; message?: string }
      if (shouldAbandonClientPoll({ httpStatus: e.statusCode })) {
        handleSaveFailed(saveKey, SAVE_JOB_LOST_MESSAGE, true)
        return
      }
      handleSaveFailed(
        saveKey,
        e.statusMessage ?? e.message ?? 'Failed to track save progress',
        saveKey === NEW_PLAYLIST_SAVE_KEY,
      )
    }
    finally {
      pollingJobIds.delete(jobId)
    }
  }

  async function startSaveJob(
    target: ClientSaveTarget,
    snapshot: CardSaveSnapshot,
    options?: { acknowledgeCapacityRisk?: boolean, normalizeVolume?: boolean },
  ) {
    const identity = resolveClientSaveTarget(target)
    const { jobId } = await $fetch<{ jobId: string }>(
      identity.endpoint,
      {
        method: 'POST',
        body: {
          playlist: snapshot.playlist,
          baselinePlaylist: snapshot.baseline,
          cardTitle: snapshot.cardTitle,
          acknowledgeCapacityRisk: options?.acknowledgeCapacityRisk === true,
          normalizeVolume: options?.normalizeVolume === true,
        },
      },
    )

    const startedAt = Date.now()
    const initialState: CardSaveState = {
      saveKey: identity.saveKey,
      cardId: identity.operation === 'update' ? identity.cardId : undefined,
      jobId,
      status: 'planning',
      progress: 0,
      operationProgress: 0,
      tracks: [],
      snapshot: cloneSnapshot(snapshot),
      startedAt,
    }
    maxOverallProgressByCard.set(identity.saveKey, 0)
    setSaveState(identity.saveKey, initialState)
    addPersistedSave(identity.saveKey, jobId)

    void pollSaveJob(identity.saveKey, jobId, snapshot.cardTitle)
  }

  async function hydratePersistedSaves() {
    const persisted = readPersistedSaves()

    for (const [saveKey, { jobId, startedAt }] of Object.entries(persisted)) {
      if (getSaveState(saveKey)) continue

      try {
        const job = await $fetch<SaveJobState>(`/api/yoto/jobs/${jobId}`)

        if (isTerminalStatus(job.status)) {
          removePersistedSave(saveKey)
          if (job.status === 'failed') {
            handleSaveFailed(saveKey, job.error ?? 'Save failed', job.outcomeUncertain === true)
          }
          if (job.status === 'complete' && selectedSaveKey.value === saveKey) {
            await finalizeSaveSuccess(saveKey)
          }
          continue
        }

        const placeholderSnapshot: CardSaveSnapshot = {
          playlist: [],
          baseline: [],
          cardTitle: '',
        }
        setSaveState(
          saveKey,
          saveStateFromJob(saveKey, job, placeholderSnapshot, startedAt),
        )

        if (selectedSaveKey.value === saveKey) {
          errorMessage.value = ''
        }

        void pollSaveJob(saveKey, jobId, '')
      }
      catch (err: unknown) {
        const e = err as { statusCode?: number }
        if (shouldAbandonClientPoll({ httpStatus: e.statusCode })) {
          handleSaveFailed(saveKey, SAVE_JOB_LOST_MESSAGE, true)
        }
      }
    }
  }

  async function selectCard(card: YotoMyoCard) {
    if (loading.value) return

    cancelPlaylistManage()

    if (selectedCardId.value === card.cardId && !errorMessage.value && !isNewPlaylist.value) {
      if (!libraryCoverUrl.value && card.coverUrl?.trim()) {
        libraryCoverUrl.value = card.coverUrl.trim()
      }
      return
    }

    const currentCardId = selectedCardId.value
    const currentCardSaving = currentCardId ? isCardSaving(currentCardId) : false
    const newDraftSaving = isCardSaving(NEW_PLAYLIST_SAVE_KEY)

    if (isNewPlaylist.value) {
      if (isDirty.value && !newDraftSaving) {
        stashCurrentDraft(NEW_PLAYLIST_SAVE_KEY)
      }
      isNewPlaylist.value = false
    }
    else if (currentCardId && currentCardId !== card.cardId) {
      if (isDirty.value && !currentCardSaving) {
        stashCurrentDraft(currentCardId)
      }
      else if (!isDirty.value) {
        clearPendingDraft(currentCardId)
      }
    }

    loading.value = true
    errorMessage.value = ''
    selectedCardId.value = card.cardId
    cardTitle.value = card.title
    libraryCoverUrl.value = card.coverUrl?.trim() || null

    const inFlightSave = getSaveState(card.cardId)
    if (inFlightSave && !isTerminalStatus(inFlightSave.status)) {
      if (inFlightSave.snapshot.playlist.length > 0) {
        restoreSnapshot(inFlightSave.snapshot)
        clearPendingDraft(card.cardId)
        isPodcast.value = isKnownPodcast(card.cardId)
        loading.value = false
        return
      }

      try {
        await reloadCardFromApi(card.cardId, card.title)
        clearPendingDraft(card.cardId)
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

    const draft = pendingDrafts.value.get(card.cardId)
    if (draft) {
      restoreSnapshot(draft)
      clearPendingDraft(card.cardId)
      isPodcast.value = isKnownPodcast(card.cardId)
      originalCardDetail.value = null
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
  }

  const pendingCreateTrackCount = computed(() => pendingCreateTracks.value.length)

  function queuePendingCreateTracks(tracks: PlaylistTrack[]) {
    pendingCreateTracks.value = clonePlaylist(tracks)
  }

  function startNewPlaylist(): boolean {
    if (loading.value || (isNewPlaylist.value && isPlaylistLocked.value) || playlistManageBusy.value) return false

    const currentCardId = selectedCardId.value
    const currentCardSaving = currentCardId ? isCardSaving(currentCardId) : false
    if (isEditing.value && isDirty.value && !currentCardSaving && !isNewPlaylist.value) {
      stashCurrentDraft(currentCardId!)
    }

    if (isNewPlaylist.value && isDirty.value) {
      return true
    }

    cancelPlaylistManage()

    const draft = pendingDrafts.value.get(NEW_PLAYLIST_SAVE_KEY)
    selectedCardId.value = null
    isNewPlaylist.value = true
    isPodcast.value = false
    originalCardDetail.value = null
    libraryCoverUrl.value = null
    errorMessage.value = ''
    setCreateOutcomeUncertain(false)
    pendingCreateTracks.value = []
    cancelUpdatePrompt()

    if (draft) {
      restoreSnapshot(draft)
      clearPendingDraft(NEW_PLAYLIST_SAVE_KEY)
      return true
    }

    cardTitle.value = ''
    playlist.value = []
    baselinePlaylist.value = []
    return true
  }

  async function confirmNewPlaylistName(title: string): Promise<boolean> {
    const name = title.trim()
    if (!isNewPlaylist.value || !name) return false
    if (
      createOutcomeUncertain.value
      || loading.value
      || isPlaylistLocked.value
      || saveStarting.value
      || isCardSaving(NEW_PLAYLIST_SAVE_KEY)
    ) {
      return false
    }

    const createError = getStandalonePlaylistCreateError(name, playlist.value)
    if (createError) {
      errorMessage.value = createError
      playEvent('saveError')
      return false
    }

    cardTitle.value = name
    errorMessage.value = ''

    const inbound = pendingCreateTracks.value
    if (inbound.length > 0) {
      const result = insertTracks(inbound)
      if (!result.ok) {
        playEvent('saveError')
        errorMessage.value = result.message
        return false
      }
      pendingCreateTracks.value = []
    }

    if (playlist.value.length === 0) {
      saveStarting.value = true
      try {
        await startSaveJob(
          { operation: 'create' },
          {
            playlist: clonePlaylist(playlist.value),
            baseline: clonePlaylist(baselinePlaylist.value),
            cardTitle: name,
          },
        )
        return true
      }
      catch (err: unknown) {
        const failure = classifyCreateStartFailure(err)
        setCreateOutcomeUncertain(failure.outcomeUncertain)
        errorMessage.value = failure.message
        playEvent('saveError')
        return false
      }
      finally {
        saveStarting.value = false
      }
    }

    requestUpdate('footer')
    return true
  }

  const canAcceptTracks = computed(() =>
    canAcceptPlaylistTracks({
      isEditing: isEditing.value,
      isNewPlaylist: isNewPlaylist.value,
      title: cardTitle.value,
    })
    && !(isNewPlaylist.value && (saveStarting.value || isCardSaving(NEW_PLAYLIST_SAVE_KEY))),
  )

  function insertTracks(
    tracks: PlaylistTrack[],
    atIndex?: number,
  ): InsertTracksResult {
    if (!isEditing.value) {
      return { ok: false, message: 'Start a new playlist or open one from Playlists before importing.' }
    }
    if (!canAcceptTracks.value) {
      return { ok: false, message: UNNAMED_PLAYLIST_ADD_MESSAGE }
    }
    if (loading.value || isPlaylistLocked.value) {
      return { ok: false, message: 'Wait for the current card operation to finish.' }
    }
    if (isPodcast.value) {
      return { ok: false, message: 'Podcasts cannot be edited yet.' }
    }

    const { unique, skipped, overflow } = selectIncomingTracks(playlist.value, tracks)

    const toAdd = unique

    if (toAdd.length === 0) {
      return { ok: true, added: 0, skipped, overflow }
    }

    const cloned = clonePlaylist(toAdd)
    const insertAt = atIndex === undefined
      ? undefined
      : snapInsertTrackIndex(playlist.value, atIndex)
    if (insertAt === undefined || insertAt < 0 || insertAt >= playlist.value.length) {
      playlist.value = [...playlist.value, ...cloned]
    }
    else {
      const next = [...playlist.value]
      next.splice(insertAt, 0, ...cloned)
      playlist.value = next
    }
    errorMessage.value = ''
    return {
      ok: true,
      added: toAdd.length,
      skipped,
      overflow,
      firstAddedId: toAdd[0]?.id,
    }
  }

  function appendTracks(tracks: PlaylistTrack[]): InsertTracksResult {
    if (!isEditing.value) {
      const started = startNewPlaylist()
      if (!started) {
        return { ok: false, message: 'Start a new playlist or open one from Playlists before importing.' }
      }
    }
    return insertTracks(tracks)
  }

  function clearSelection(force = false): boolean {
    const currentCardId = selectedCardId.value
    const currentCardSaving = currentCardId ? isCardSaving(currentCardId) : false
    const newDraftSaving = isCardSaving(NEW_PLAYLIST_SAVE_KEY)

    if (isNewPlaylist.value && isDirty.value && !newDraftSaving) {
      if (force) clearPendingDraft(NEW_PLAYLIST_SAVE_KEY)
      else stashCurrentDraft(NEW_PLAYLIST_SAVE_KEY)
    }
    else if (currentCardId && isDirty.value && !currentCardSaving) {
      if (force) {
        clearPendingDraft(currentCardId)
      }
      else {
        stashCurrentDraft(currentCardId)
      }
    }

    selectedCardId.value = null
    isNewPlaylist.value = false
    cardTitle.value = ''
    isPodcast.value = false
    playlist.value = []
    baselinePlaylist.value = []
    originalCardDetail.value = null
    libraryCoverUrl.value = null
    errorMessage.value = ''
    setCreateOutcomeUncertain(false)
    cancelPlaylistManage(true)
    return true
  }

  function resetChanges() {
    if (!isDirty.value || isPlaylistLocked.value) return
    const cardId = selectedCardId.value
    playlist.value = clonePlaylist(baselinePlaylist.value)
    errorMessage.value = ''
    if (isNewPlaylist.value) {
      cardTitle.value = ''
      setCreateOutcomeUncertain(false)
      pendingCreateTracks.value = []
      clearPendingDraft(NEW_PLAYLIST_SAVE_KEY)
    }
    else if (cardId) {
      clearPendingDraft(cardId)
    }
  }

  function setTrackArt(trackId: string, icon16x16: string, previewUrl: string) {
    if (isPlaylistLocked.value || isPodcast.value) return
    const index = playlist.value.findIndex(track => track.id === trackId)
    if (index < 0) return
    const current = playlist.value[index]!
    const next = applyTrackIcon(current, icon16x16, previewUrl)
    const copy = clonePlaylist(playlist.value)
    copy[index] = next
    playlist.value = copy
  }

  function setTrackTrim(trackId: string, trim: PlaylistTrack['trim'] | null) {
    if (isPlaylistLocked.value || isPodcast.value) return
    const index = playlist.value.findIndex(track => track.id === trackId)
    if (index < 0) return
    const current = playlist.value[index]!
    const blockIndex = blockIndexForTrack(playlist.value, index)
    if (blockIndex < 0) return
    const block = playlistBlocks(playlist.value)[blockIndex]
    if (!block) return
    const sourceDuration = splitSourceDuration(current, playlist.value)
    const start = trackIndexForBlock(playlist.value, blockIndex)
    const copy = clonePlaylist(playlist.value)
    if (!(sourceDuration > 0)) {
      for (let offset = 0; offset < block.tracks.length; offset++) {
        const row = copy[start + offset]
        if (!row) continue
        if (trim) row.trim = { ...trim }
        else delete row.trim
      }
      playlist.value = copy
      return
    }
    const source = clonePlaylist([block.tracks[0]!])[0]!
    const rows = applySourceTrimAndSplit(source, trim, sourceDuration)
    copy.splice(start, block.tracks.length, ...clonePlaylist(rows))
    playlist.value = copy
  }

  async function persistTrackArt(
    trackId: string,
    icon16x16: string,
    previewUrl: string,
  ): Promise<{ patched: boolean; error?: string }> {
    if (isPlaylistLocked.value || isPodcast.value) {
      return { patched: false }
    }

    setTrackArt(trackId, icon16x16, previewUrl)

    const cardId = selectedCardId.value
    const track = playlist.value.find(item => item.id === trackId)
    if (
      !cardId
      || !track
      || !track.chapterKey
      || !track.trackKey
      || !isPersistedCardTrack(track, baselinePlaylist.value)
    ) {
      return { patched: false }
    }

    try {
      await $fetch(`/api/yoto/content/${cardId}/patch-icon`, {
        method: 'POST',
        body: {
          chapterKey: track.chapterKey,
          trackKey: track.trackKey,
          icon16x16,
        },
      })

      const baselineIndex = baselinePlaylist.value.findIndex(
        item => playlistRowId(item) === playlistRowId(track),
      )
      if (baselineIndex >= 0) {
        const copy = clonePlaylist(baselinePlaylist.value)
        copy[baselineIndex] = applyTrackIcon(copy[baselineIndex]!, icon16x16, previewUrl)
        baselinePlaylist.value = copy
      }

      return { patched: true }
    }
    catch (err: unknown) {
      const e = err as { statusMessage?: string; message?: string; data?: { statusMessage?: string } }
      const message = (
        e.statusMessage
        ?? e.data?.statusMessage
        ?? e.message
        ?? 'Failed to save track art'
      )
      const displayMessage = message.length > 240 ? `${message.slice(0, 237)}…` : message
      errorMessage.value = displayMessage
      playEvent('saveError')
      return { patched: false, error: displayMessage }
    }
  }

  const playlistManagePrompt = ref<PlaylistManagePrompt | null>(null)
  const playlistManageBusy = ref(false)
  const playlistArtworkOpen = ref(false)
  const libraryCoverUrl = ref<string | null>(null)

  const playlistCoverUrl = computed(() => {
    const imageL = originalCardDetail.value?.metadata?.cover?.imageL
    if (typeof imageL === 'string' && imageL.trim()) return imageL.trim()
    const fromLibrary = libraryCoverUrl.value?.trim()
    return fromLibrary || null
  })

  function canManageLoadedPlaylist(): boolean {
    return Boolean(
      selectedCardId.value
      && !isNewPlaylist.value
      && !loading.value
      && !isPlaylistLocked.value
      && !saveStarting.value
      && !playlistManageBusy.value,
    )
  }

  function cancelPlaylistManage(force = false) {
    if (playlistManageBusy.value && !force) return
    playlistManagePrompt.value = null
    playlistArtworkOpen.value = false
  }

  function startRename(): boolean {
    if (!canManageLoadedPlaylist()) return false
    cancelUpdatePrompt()
    playlistArtworkOpen.value = false
    playlistManagePrompt.value = 'rename'
    return true
  }

  function startDelete(): boolean {
    if (!canManageLoadedPlaylist()) return false
    cancelUpdatePrompt()
    playlistArtworkOpen.value = false
    playlistManagePrompt.value = 'delete'
    return true
  }

  function startArtwork(): boolean {
    if (!canManageLoadedPlaylist()) return false
    cancelUpdatePrompt()
    playlistManagePrompt.value = null
    playlistArtworkOpen.value = true
    return true
  }

  function closeArtwork() {
    if (playlistManageBusy.value) return
    playlistArtworkOpen.value = false
  }

  function apiErrorMessage(err: unknown, fallback: string): string {
    const e = err as { statusMessage?: string; message?: string; data?: { statusMessage?: string; message?: string } }
    const message = (
      e.data?.statusMessage
      ?? e.data?.message
      ?? e.statusMessage
      ?? e.message
      ?? fallback
    )
    return message.length > 240 ? `${message.slice(0, 237)}…` : message
  }

  async function confirmRename(title: string): Promise<boolean> {
    const name = title.trim()
    const cardId = selectedCardId.value
    if (!cardId || !name || playlistManagePrompt.value !== 'rename') return false
    if (!canManageLoadedPlaylist() && !playlistManageBusy.value) return false
    if (isPlaylistLocked.value || saveStarting.value || loading.value) return false

    if (name === cardTitle.value.trim()) {
      playlistManagePrompt.value = null
      return true
    }

    playlistManageBusy.value = true
    try {
      await $fetch(`/api/yoto/content/${cardId}/patch-title`, {
        method: 'POST',
        body: { cardTitle: name },
      })
      cardTitle.value = name
      if (originalCardDetail.value) {
        originalCardDetail.value = { ...originalCardDetail.value, title: name }
      }
      const draft = pendingDrafts.value.get(cardId)
      if (draft) {
        pendingDrafts.value.set(cardId, { ...draft, cardTitle: name })
        touchPendingDrafts()
      }
      errorMessage.value = ''
      playlistManagePrompt.value = null
      options.onPlaylistRenamed?.(cardId, name)
      return true
    }
    catch (err: unknown) {
      errorMessage.value = apiErrorMessage(err, 'Failed to rename playlist')
      playEvent('saveError')
      return false
    }
    finally {
      playlistManageBusy.value = false
    }
  }

  async function confirmDelete(): Promise<boolean> {
    const cardId = selectedCardId.value
    if (!cardId || playlistManagePrompt.value !== 'delete') return false
    if (isPlaylistLocked.value || saveStarting.value || loading.value) return false
    if (playlistManageBusy.value) return false

    playlistManageBusy.value = true
    try {
      await $fetch(`/api/yoto/content/${cardId}`, { method: 'DELETE' })
      clearPendingDraft(cardId)
      playlistManagePrompt.value = null
      errorMessage.value = ''
      clearSelection(true)
      options.onPlaylistDeleted?.(cardId)
      return true
    }
    catch (err: unknown) {
      errorMessage.value = apiErrorMessage(err, 'Failed to delete playlist')
      playEvent('saveError')
      return false
    }
    finally {
      playlistManageBusy.value = false
    }
  }

  async function confirmArtwork(spec: PlaylistArtworkSpec): Promise<boolean> {
    const cardId = selectedCardId.value
    if (!cardId || !playlistArtworkOpen.value) return false
    if (!canManageLoadedPlaylist() && !playlistManageBusy.value) return false
    if (isPlaylistLocked.value || saveStarting.value || loading.value) return false
    if (playlistManageBusy.value) return false

    playlistManageBusy.value = true
    try {
      const result = await $fetch<{ ok: true; coverUrl: string }>(
        `/api/yoto/content/${cardId}/patch-cover`,
        {
          method: 'POST',
          body: spec,
        },
      )
      const coverUrl = result.coverUrl?.trim()
      if (!coverUrl) {
        throw new Error('Cover save did not return an image URL')
      }
      if (originalCardDetail.value) {
        originalCardDetail.value = {
          ...originalCardDetail.value,
          metadata: {
            ...originalCardDetail.value.metadata,
            cover: { imageL: coverUrl },
          },
        }
      }
      libraryCoverUrl.value = coverUrl
      errorMessage.value = ''
      playlistArtworkOpen.value = false
      options.onPlaylistCoverChanged?.(cardId, coverUrl)
      return true
    }
    catch (err: unknown) {
      errorMessage.value = apiErrorMessage(err, 'Failed to save playlist artwork')
      playEvent('saveError')
      return false
    }
    finally {
      playlistManageBusy.value = false
    }
  }

  async function confirmArtworkUpload(file: Blob): Promise<boolean> {
    const cardId = selectedCardId.value
    if (!cardId || !playlistArtworkOpen.value) return false
    if (!canManageLoadedPlaylist() && !playlistManageBusy.value) return false
    if (isPlaylistLocked.value || saveStarting.value || loading.value) return false
    if (playlistManageBusy.value) return false

    playlistManageBusy.value = true
    try {
      const body = new FormData()
      body.append('file', file, 'cover.png')
      const result = await $fetch<{ ok: true; coverUrl: string }>(
        `/api/yoto/content/${cardId}/patch-cover-upload`,
        {
          method: 'POST',
          body,
        },
      )
      const coverUrl = result.coverUrl?.trim()
      if (!coverUrl) {
        throw new Error('Cover save did not return an image URL')
      }
      if (originalCardDetail.value) {
        originalCardDetail.value = {
          ...originalCardDetail.value,
          metadata: {
            ...originalCardDetail.value.metadata,
            cover: { imageL: coverUrl },
          },
        }
      }
      libraryCoverUrl.value = coverUrl
      errorMessage.value = ''
      playlistArtworkOpen.value = false
      options.onPlaylistCoverChanged?.(cardId, coverUrl)
      return true
    }
    catch (err: unknown) {
      errorMessage.value = apiErrorMessage(err, 'Failed to save playlist artwork')
      playEvent('saveError')
      return false
    }
    finally {
      playlistManageBusy.value = false
    }
  }

  const updatePrompt = ref<UpdatePromptKind | null>(null)
  const updatePromptSurface = ref<UpdatePromptSurface | null>(null)
  const updatePromptCardCount = ref(1)
  const saveStarting = ref(false)
  let pendingCapacityAck = false
  let updateScope: UpdatePromptScope = 'selected'

  function livePendingInput() {
    if (isNewPlaylist.value) {
      if (loading.value) return null
      return {
        cardId: NEW_PLAYLIST_SAVE_KEY,
        snapshot: {
          playlist: clonePlaylist(playlist.value),
          baseline: clonePlaylist(baselinePlaylist.value),
          cardTitle: cardTitle.value,
        },
        isDirty: isDirty.value,
        isPodcast: false,
        isSaving: isCardSaving(NEW_PLAYLIST_SAVE_KEY),
        cardDetail: null,
      }
    }
    const cardId = selectedCardId.value
    if (!cardId || loading.value) return null
    return {
      cardId,
      snapshot: {
        playlist: clonePlaylist(playlist.value),
        baseline: clonePlaylist(baselinePlaylist.value),
        cardTitle: cardTitle.value,
      },
      isDirty: isDirty.value,
      isPodcast: isPodcast.value,
      isSaving: isCardSaving(cardId),
      cardDetail: originalCardDetail.value,
    }
  }

  function collectAllPending(): PendingUpdateTarget[] {
    return collectPendingUpdateTargets({
      live: isNewPlaylist.value ? null : livePendingInput(),
      drafts: pendingDrafts.value,
      isPodcast: isKnownPodcast,
      isSaving: isCardSaving,
    })
  }

  function targetsForCurrentScope(): PendingUpdateTarget[] {
    if (updateScope === 'selected') {
      if (isNewPlaylist.value) {
        const live = livePendingInput()
        if (!live || live.isSaving) return []
        return [pendingTargetFrom(live.cardId, live.snapshot, live.cardDetail)]
      }
      const live = livePendingInput()
      if (!live) return []
      return collectPendingUpdateTargets({
        live,
        drafts: new Map(),
        isPodcast: isKnownPodcast,
        isSaving: isCardSaving,
      })
    }
    return collectAllPending()
  }

  function clearUpdatePrompt() {
    updatePrompt.value = null
    updatePromptSurface.value = null
    saveStarting.value = false
    updatePromptCardCount.value = 1
  }

  function cancelUpdatePrompt() {
    clearUpdatePrompt()
    pendingCapacityAck = false
    updateScope = 'selected'
  }

  function beginPromptedUpdate(
    surface: UpdatePromptSurface,
    scope: UpdatePromptScope,
    targets: PendingUpdateTarget[],
  ) {
    if (targets.length === 0) return
    pendingCapacityAck = false
    updateScope = scope
    updatePromptSurface.value = surface
    updatePromptCardCount.value = targets.length
    if (planPendingUpdates(targets).overCapacity) {
      updatePrompt.value = 'capacity'
      return
    }
    continueAfterCapacity()
  }

  function continueAfterCapacity() {
    const targets = targetsForCurrentScope()
    if (targets.length === 0) {
      cancelUpdatePrompt()
      return
    }
    updatePromptCardCount.value = targets.length
    if (planPendingUpdates(targets).extractsYoutube) {
      updatePrompt.value = 'normalize'
      return
    }
    void startQueuedUpdates({
      acknowledgeCapacityRisk: pendingCapacityAck,
      normalizeVolume: false,
    })
  }

  function requestUpdate(surface: UpdatePromptSurface = 'footer') {
    if (playlistManageBusy.value) return
    cancelPlaylistManage()
    if (isNewPlaylist.value) {
      if (createOutcomeUncertain.value || loading.value || isPlaylistLocked.value) return
      const validationError = getStandalonePlaylistValidationError(cardTitle.value, playlist.value)
      if (validationError) {
        errorMessage.value = validationError
        playEvent('saveError')
        return
      }
      const live = livePendingInput()
      if (!live) return
      beginPromptedUpdate(surface, 'selected', [
        pendingTargetFrom(live.cardId, live.snapshot, live.cardDetail),
      ])
      return
    }
    const cardId = selectedCardId.value
    if (!cardId || !isDirty.value || loading.value || isPlaylistLocked.value || isPodcast.value) return
    const live = livePendingInput()
    if (!live) return
    beginPromptedUpdate(
      surface,
      'selected',
      collectPendingUpdateTargets({
        live,
        drafts: new Map(),
        isPodcast: isKnownPodcast,
        isSaving: isCardSaving,
      }),
    )
  }

  function requestUpdatePending(surface: UpdatePromptSurface = 'dialog') {
    if (hasActiveSaves.value || playlistManageBusy.value) return
    cancelPlaylistManage()
    beginPromptedUpdate(surface, 'pending', collectAllPending())
  }

  function confirmUpdatePrompt() {
    if (updatePrompt.value === 'capacity') {
      pendingCapacityAck = true
      continueAfterCapacity()
      return
    }
    if (updatePrompt.value === 'normalize') {
      saveStarting.value = true
      void startQueuedUpdates({
        acknowledgeCapacityRisk: pendingCapacityAck,
        normalizeVolume: true,
      })
    }
  }

  function keepVolumeAsIs() {
    if (updatePrompt.value !== 'normalize') return
    saveStarting.value = true
    void startQueuedUpdates({
      acknowledgeCapacityRisk: pendingCapacityAck,
      normalizeVolume: false,
    })
  }

  async function startUpdateForCard(
    target: PendingUpdateTarget,
    options: { acknowledgeCapacityRisk?: boolean, normalizeVolume?: boolean },
  ) {
    const { cardId, snapshot } = target
    if (isCardSaving(cardId) || (cardId !== NEW_PLAYLIST_SAVE_KEY && isKnownPodcast(cardId))) return

    const acknowledgeCapacityRisk = options.acknowledgeCapacityRisk === true && target.overCapacity
    const normalizeVolume = options.normalizeVolume === true && target.extractsYoutube

    if (cardId === NEW_PLAYLIST_SAVE_KEY) {
      const validationError = getStandalonePlaylistValidationError(snapshot.cardTitle, snapshot.playlist)
      if (validationError) {
        errorMessage.value = validationError
        playEvent('saveError')
        return
      }
    }

    if (!acknowledgeCapacityRisk) {
      const limitError = getPlaylistPreflightLimitError(snapshot.playlist)
      if (limitError) {
        errorMessage.value = limitError
        playEvent('saveError')
        return
      }
    }

    if (selectedSaveKey.value === cardId) {
      errorMessage.value = ''
    }

    const saveTarget: ClientSaveTarget = cardId === NEW_PLAYLIST_SAVE_KEY
      ? { operation: 'create' }
      : { operation: 'update', cardId }

    try {
      await startSaveJob(saveTarget, snapshot, {
        acknowledgeCapacityRisk,
        normalizeVolume,
      })
    }
    catch (err: unknown) {
      if (cardId === NEW_PLAYLIST_SAVE_KEY) {
        const failure = classifyCreateStartFailure(err)
        setCreateOutcomeUncertain(failure.outcomeUncertain)
        errorMessage.value = failure.message
        playEvent('saveError')
        return
      }
      const e = err as { statusMessage?: string; message?: string }
      errorMessage.value = e.statusMessage ?? e.message ?? 'Failed to update card'
    }
  }

  async function startQueuedUpdates(options: {
    acknowledgeCapacityRisk?: boolean
    normalizeVolume?: boolean
  }) {
    const targets = targetsForCurrentScope()
    updatePrompt.value = null
    updatePromptSurface.value = null
    saveStarting.value = true

    if (targets.length === 0) {
      saveStarting.value = false
      pendingCapacityAck = false
      updatePromptCardCount.value = 1
      updateScope = 'selected'
      return
    }

    try {
      await Promise.all(targets.map(target => startUpdateForCard(target, options)))
    }
    finally {
      saveStarting.value = false
      pendingCapacityAck = false
      updatePromptCardCount.value = 1
      updateScope = 'selected'
    }
  }

  async function updateCard(options?: { acknowledgeCapacityRisk?: boolean, normalizeVolume?: boolean }) {
    updateScope = 'selected'
    await startQueuedUpdates(options ?? {})
  }

  onMounted(() => {
    hydratePersistedDrafts()
    void hydratePersistedSaves()
    window.addEventListener('pagehide', persistPendingDrafts)
    document.addEventListener('visibilitychange', flushDraftsOnHide)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', persistPendingDrafts)
    document.removeEventListener('visibilitychange', flushDraftsOnHide)
    persistPendingDrafts()
  })

  const showUncertainCreateCover = computed(
    () => createOutcomeUncertain.value && !uncertainCreateCoverDismissed.value,
  )

  function dismissUncertainCreateCover() {
    if (!createOutcomeUncertain.value) return
    uncertainCreateCoverDismissed.value = true
  }

  function flushDraftsOnHide() {
    if (document.visibilityState === 'hidden') persistPendingDrafts()
  }

  watch(
    [isDirty, isPlaylistLocked, isPodcast, selectedCardId, pendingPlaylistUpdateCount],
    () => {
      if (!updatePrompt.value) return
      if (updateScope === 'pending') {
        if (collectAllPending().length === 0) cancelUpdatePrompt()
        return
      }
      if (!isDirty.value || isPlaylistLocked.value || isPodcast.value || !isEditing.value) {
        cancelUpdatePrompt()
      }
    },
  )

  // Keep durable drafts in sync while editing — debounced; flushed on hide/unmount.
  watch(
    [playlist, baselinePlaylist, cardTitle, selectedCardId, isNewPlaylist, isDirty, isPodcast],
    () => {
      schedulePersistPendingDrafts()
    },
  )

  return {
    selectedCardId,
    isNewPlaylist,
    createOutcomeUncertain,
    showUncertainCreateCover,
    dismissUncertainCreateCover,
    cardTitle,
    playlist,
    isEditing,
    canAcceptTracks,
    isPodcast,
    loading,
    updating,
    isPlaylistLocked,
    hasActiveSaves,
    activeSaveProgress,
    saveProgress,
    errorMessage,
    isDirty,
    pendingPlaylistUpdateCount,
    pendingDraftCardIds,
    pendingUpdateTitle,
    isCardSaving,
    isKnownPodcast,
    selectCard,
    startNewPlaylist,
    queuePendingCreateTracks,
    pendingCreateTrackCount,
    confirmNewPlaylistName,
    appendTracks,
    insertTracks,
    clearSelection,
    resetChanges,
    requestUpdate,
    requestUpdatePending,
    cancelUpdatePrompt,
    confirmUpdatePrompt,
    keepVolumeAsIs,
    updatePrompt,
    updatePromptSurface,
    updatePromptCardCount,
    saveStarting,
    updateCard,
    setTrackArt,
    persistTrackArt,
    setTrackTrim,
    playlistManagePrompt,
    playlistManageBusy,
    playlistArtworkOpen,
    playlistCoverUrl,
    startRename,
    startDelete,
    startArtwork,
    closeArtwork,
    cancelPlaylistManage,
    confirmRename,
    confirmDelete,
    confirmArtwork,
    confirmArtworkUpload,
  }
}
