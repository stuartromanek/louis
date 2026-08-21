import type { PlaylistTrack, TrackSplit } from './types.ts'
import { playlistHasTrack } from './playlistTrackMatch.ts'
import {
  YOTO_MYO_MAX_TRACKS,
  YOTO_MYO_MAX_TRACK_SECONDS,
  YOTO_MYO_SPLIT_TRACK_SECONDS,
  projectedPlaylistTrackCount,
} from './yotoMyoLimits.ts'

const PART_TITLE_MAX = 100

export interface SplitPartRange {
  start: number
  duration: number
}

export interface TrackSplitPlan {
  count: number
  parts: SplitPartRange[]
}

export type PlaylistBlock =
  | { kind: 'single'; tracks: [PlaylistTrack] }
  | { kind: 'split'; tracks: PlaylistTrack[] }

export function planTrackSplit(durationSeconds: number): TrackSplitPlan | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= YOTO_MYO_SPLIT_TRACK_SECONDS) {
    return null
  }

  const count = Math.ceil(durationSeconds / YOTO_MYO_SPLIT_TRACK_SECONDS)
  if (count < 2) return null

  const base = Math.floor(durationSeconds / count)
  const parts: SplitPartRange[] = []
  let start = 0
  for (let index = 0; index < count; index++) {
    const duration = index === count - 1
      ? durationSeconds - start
      : base
    parts.push({ start, duration })
    start += duration
  }

  return { count, parts }
}

export function splitPartTrackId(youtubeId: string, index: number): string {
  return `${youtubeId}#p${index}`
}

export function splitPartTitle(baseTitle: string, index: number): string {
  const suffix = ` (Part ${index + 1})`
  const trimmed = baseTitle.trim()
  if (trimmed.length + suffix.length <= PART_TITLE_MAX) return `${trimmed}${suffix}`
  const room = Math.max(0, PART_TITLE_MAX - suffix.length)
  return `${trimmed.slice(0, room).trimEnd()}${suffix}`
}

/** Shared album/video name for a split group, without the `(Part N)` suffix. */
export function splitGroupSourceTitle(title: string): string {
  const raw = title.replace(/\s+\(Part \d+\)\s*$/i, '').trim()
  return raw || title
}

export function splitPartNumberLabel(index: number): string {
  return `Part ${index + 1}`
}

/** Spoken name for a slat: source title, plus Part N when this row is a split chapter. */
export function splitTrackAccessibleName(track: {
  title: string
  split?: TrackSplit
}): string {
  if (!track.split) return splitGroupSourceTitle(track.title)
  return `${splitGroupSourceTitle(track.title)}, ${splitPartNumberLabel(track.split.index)}`
}

export function formatSplitIntoChip(partCount: number): string {
  return `Splits into ${partCount}`
}

export function makeTrackSplit(
  groupId: string,
  index: number,
  plan: TrackSplitPlan,
): TrackSplit {
  const part = plan.parts[index]!
  return {
    groupId,
    index,
    count: plan.count,
    startSeconds: part.start,
    durationSeconds: part.duration,
  }
}

export function isValidTrackSplit(value: unknown): value is TrackSplit {
  if (!value || typeof value !== 'object') return false
  const split = value as TrackSplit
  return typeof split.groupId === 'string'
    && split.groupId.trim().length > 0
    && Number.isInteger(split.index)
    && split.index >= 0
    && Number.isInteger(split.count)
    && split.count >= 2
    && split.index < split.count
    && Number.isFinite(split.startSeconds)
    && split.startSeconds >= 0
    && Number.isFinite(split.durationSeconds)
    && split.durationSeconds > 0
}

export function playlistBlocks(playlist: PlaylistTrack[]): PlaylistBlock[] {
  const blocks: PlaylistBlock[] = []
  let index = 0
  while (index < playlist.length) {
    const track = playlist[index]!
    const groupId = track.split?.groupId
    const count = track.split?.count
    if (!groupId || !count || count < 2 || track.split?.index !== 0) {
      blocks.push({ kind: 'single', tracks: [track] })
      index += 1
      continue
    }

    const run: PlaylistTrack[] = [track]
    let cursor = index + 1
    while (cursor < playlist.length) {
      const next = playlist[cursor]!
      if (next.split?.groupId !== groupId) break
      if (next.split.index !== run.length) break
      run.push(next)
      cursor += 1
    }

    if (run.length === count) {
      blocks.push({ kind: 'split', tracks: run })
      index = cursor
      continue
    }

    blocks.push({ kind: 'single', tracks: [track] })
    index += 1
  }
  return blocks
}

export function sanitizeSplitGrouping(playlist: PlaylistTrack[]): PlaylistTrack[] {
  const groupedIds = new Set(
    playlistBlocks(playlist)
      .filter(block => block.kind === 'split')
      .flatMap(block => block.tracks.map(track => track.id)),
  )
  return playlist.map((track) => {
    if (!track.split || groupedIds.has(track.id)) return track
    const { split: _split, ...rest } = track
    return {
      ...rest,
      title: splitGroupSourceTitle(track.title),
    }
  })
}

export function isCompleteSplitCopy(tracks: Array<{ split?: TrackSplit }>): boolean {
  if (tracks.length < 2) return false
  const groupId = tracks[0]?.split?.groupId
  const count = tracks[0]?.split?.count
  if (!groupId || !count || count !== tracks.length) return false
  if (!tracks.every(track => track.split?.groupId === groupId && track.split.count === count)) {
    return false
  }
  const indexes = tracks.map(track => track.split!.index).sort((a, b) => a - b)
  return indexes.every((value, index) => value === index)
}

export function isCompleteSplitGroup<T extends { split?: TrackSplit }>(
  group: T[],
): group is Array<T & { split: TrackSplit }> {
  return isCompleteSplitCopy(group)
}

/** Cut ffmpeg ranges even when only some chapters of a split source are extracting. */
export function extractGroupShouldCutParts<T extends { split?: TrackSplit }>(group: T[]): boolean {
  return group.some(item => Boolean(item.split))
}

export function selectIncomingTracks(
  playlist: PlaylistTrack[],
  incoming: PlaylistTrack[],
  maxTracks: number = YOTO_MYO_MAX_TRACKS,
): { unique: PlaylistTrack[], skipped: number, overflow: number } {
  const unique: PlaylistTrack[] = []
  let skipped = 0
  let overflow = 0
  let room = Math.max(0, maxTracks - projectedPlaylistTrackCount(playlist))

  for (const block of incomingTrackBlocks(incoming)) {
    const representative = block[0]
    if (!representative) continue
    if (playlistHasTrack(playlist, representative) || playlistHasTrack(unique, representative)) {
      skipped += block.length
      continue
    }
    if (block.length > room) {
      overflow += block.length
      continue
    }
    unique.push(...block)
    room -= block.length
  }

  return { unique, skipped, overflow }
}

export function removeTrackOrGroup(playlist: PlaylistTrack[], id: string): PlaylistTrack[] {
  const track = playlist.find(item => item.id === id)
  if (!track) return playlist
  const grouped = playlistBlocks(playlist).find(
    block => block.kind === 'split' && block.tracks.some(item => item.id === id),
  )
  if (grouped?.kind === 'split') {
    const groupId = grouped.tracks[0]?.split?.groupId
    if (groupId) return playlist.filter(item => item.split?.groupId !== groupId)
  }
  return playlist.filter(item => item.id !== id)
}

export function blockIndexForTrack(playlist: PlaylistTrack[], trackIndex: number): number {
  if (trackIndex < 0 || trackIndex >= playlist.length) return -1
  const blocks = playlistBlocks(playlist)
  let cursor = 0
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const size = blocks[blockIndex]!.tracks.length
    if (trackIndex < cursor + size) return blockIndex
    cursor += size
  }
  return -1
}

export function trackIndexForBlock(playlist: PlaylistTrack[], blockIndex: number): number {
  const blocks = playlistBlocks(playlist)
  if (blockIndex < 0 || blockIndex >= blocks.length) return playlist.length
  let cursor = 0
  for (let index = 0; index < blockIndex; index++) {
    cursor += blocks[index]!.tracks.length
  }
  return cursor
}

export function snapInsertTrackIndex(playlist: PlaylistTrack[], trackIndex: number): number {
  if (trackIndex <= 0) return 0
  if (trackIndex >= playlist.length) return playlist.length
  const blockIndex = blockIndexForTrack(playlist, trackIndex)
  if (blockIndex < 0) return trackIndex
  const blockStart = trackIndexForBlock(playlist, blockIndex)
  return blockStart === trackIndex ? trackIndex : blockStart
}

export function reorderPlaylistBlocks(
  playlist: PlaylistTrack[],
  fromBlockIndex: number,
  toBlockIndex: number,
): PlaylistTrack[] {
  const blocks = playlistBlocks(playlist)
  if (
    fromBlockIndex === toBlockIndex
    || fromBlockIndex < 0
    || toBlockIndex < 0
    || fromBlockIndex >= blocks.length
    || toBlockIndex >= blocks.length
  ) {
    return playlist
  }

  const next = [...blocks]
  const [block] = next.splice(fromBlockIndex, 1)
  if (!block) return playlist
  next.splice(toBlockIndex, 0, block)
  return next.flatMap(item => item.tracks)
}

export function movePlaylistBlock(
  playlist: PlaylistTrack[],
  fromTrackIndex: number,
  delta: number,
): PlaylistTrack[] {
  const fromBlock = blockIndexForTrack(playlist, fromTrackIndex)
  if (fromBlock < 0 || delta === 0) return playlist
  return reorderPlaylistBlocks(playlist, fromBlock, fromBlock + delta)
}

export function incomingTrackBlocks(tracks: PlaylistTrack[]): PlaylistTrack[][] {
  return playlistBlocks(tracks).map(block => block.tracks)
}

export function scaleSplitParts(
  parts: SplitPartRange[],
  plannedTotal: number,
  actualTotal: number,
): SplitPartRange[] {
  if (parts.length === 0) return parts
  if (!Number.isFinite(actualTotal) || actualTotal <= 0) return parts

  const planned = Number.isFinite(plannedTotal) && plannedTotal > 0
    ? plannedTotal
    : parts.reduce((sum, part) => Math.max(sum, part.start + part.duration), 0)
  if (planned <= 0) return parts

  const scale = actualTotal / planned
  const scaled = parts.map(part => ({
    start: part.start * scale,
    duration: part.duration * scale,
  }))

  const lastIndex = scaled.length - 1
  let cursor = 0
  return scaled.map((part, index) => {
    const start = cursor
    const duration = index === lastIndex
      ? Math.max(0, actualTotal - start)
      : part.duration
    cursor = start + duration
    return { start, duration }
  })
}

export function expandUnsplitTrack(
  track: PlaylistTrack,
  actualDuration: number,
): PlaylistTrack[] | null {
  if (track.split) return null
  const youtubeId = track.youtubeId?.trim()
  if (!youtubeId) return null
  const plan = planTrackSplit(actualDuration)
  if (!plan) return null

  const baseTitle = splitGroupSourceTitle(track.title)
  return plan.parts.map((part, index) => ({
    ...track,
    id: splitPartTrackId(youtubeId, index),
    title: splitPartTitle(baseTitle, index),
    duration: part.duration,
    split: makeTrackSplit(youtubeId, index, plan),
    chapterKey: undefined,
    trackKey: undefined,
    yotoReuse: undefined,
  }))
}

function asUnsplitSource(track: PlaylistTrack, actualDuration: number): PlaylistTrack {
  const { split: _split, ...rest } = track
  return {
    ...rest,
    title: splitGroupSourceTitle(track.title),
    duration: actualDuration,
  }
}

export function scaledPartsExceedMaxTrack(parts: SplitPartRange[]): boolean {
  return parts.some(part => part.duration > YOTO_MYO_MAX_TRACK_SECONDS)
}

/**
 * Stretch existing cuts onto the probed file. If that would put a part over
 * Yoto’s 60-minute cap, return a fresh plan instead.
 */
export function resolveSplitCuts(
  planned: SplitPartRange[],
  plannedTotal: number,
  actualTotal: number,
): { ranges: SplitPartRange[], replanned: TrackSplitPlan | null } {
  const scaled = scaleSplitParts(planned, plannedTotal, actualTotal)
  if (!scaledPartsExceedMaxTrack(scaled)) {
    return { ranges: scaled, replanned: null }
  }
  const plan = planTrackSplit(actualTotal)
  if (!plan) return { ranges: scaled, replanned: null }
  return { ranges: plan.parts, replanned: plan }
}

/** Expand unsplit longs and re-plan split groups whose scaled parts would exceed 60 minutes. */
export function applyProbedDurations(
  playlist: PlaylistTrack[],
  durationByYoutubeId: ReadonlyMap<string, number>,
): PlaylistTrack[] {
  const out: PlaylistTrack[] = []
  for (const block of playlistBlocks(playlist)) {
    if (block.kind === 'split') {
      const youtubeId = block.tracks[0]?.youtubeId?.trim()
      const actual = youtubeId ? durationByYoutubeId.get(youtubeId) : undefined
      if (!actual) {
        out.push(...block.tracks)
        continue
      }
      const planned: SplitPartRange[] = block.tracks.map(item => ({
        start: item.split!.startSeconds,
        duration: item.split!.durationSeconds,
      }))
      const plannedTotal = planned.reduce(
        (sum, part) => Math.max(sum, part.start + part.duration),
        0,
      )
      const { ranges, replanned } = resolveSplitCuts(planned, plannedTotal, actual)
      if (replanned && replanned.count !== block.tracks.length) {
        const expanded = expandUnsplitTrack(asUnsplitSource(block.tracks[0]!, actual), actual)
        if (expanded) {
          out.push(...expanded)
          continue
        }
      }
      out.push(...block.tracks.map((item, index) => {
        const range = ranges[index]
        if (!range || !item.split) return item
        return {
          ...item,
          duration: range.duration,
          split: {
            ...item.split,
            startSeconds: range.start,
            durationSeconds: range.duration,
          },
        }
      }))
      continue
    }

    const track = block.tracks[0]!
    const youtubeId = track.youtubeId?.trim()
    const actual = youtubeId ? durationByYoutubeId.get(youtubeId) : undefined
    if (actual) {
      const expanded = expandUnsplitTrack(track, actual)
      if (expanded) {
        out.push(...expanded)
        continue
      }
    }
    out.push(track)
  }
  return out
}

/** Unsplit extracts with unknown or over-threshold duration must not upload without a probe. */
export function saveNeedsProbedDuration(track: PlaylistTrack): boolean {
  if (track.split) return false
  const duration = track.duration
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return true
  return duration > YOTO_MYO_SPLIT_TRACK_SECONDS
}
