import type {
  SaveJobPhase,
  SaveJobTrackProgress,
  SaveTrackStatus,
} from '#shared/myo-editor/types'
import { splitGroupSourceTitle } from '#shared/myo-editor/splitTrack'

const OVERALL_LABELS: Record<SaveJobPhase, string> = {
  planning: 'Preparing save…',
  downloading: 'Saving playlist…',
  uploading: 'Saving playlist…',
  posting: 'Finishing up…',
  complete: 'Complete',
  failed: 'Save failed',
}

const ACTIVE_TRACK_STATUSES: SaveTrackStatus[] = [
  'extracting',
  'leveling',
  'uploading',
  'transcoding',
]

export function saveSlowWaitHint(): string {
  return 'Still working. Long videos can take a while on Yoto.'
}

export function saveOverallLabel(phase: SaveJobPhase): string {
  return OVERALL_LABELS[phase] ?? 'Saving playlist…'
}

export function saveOperationLabel(
  phase: SaveJobPhase,
  tracks: SaveJobTrackProgress[],
): string | null {
  const active = tracks.find(track => ACTIVE_TRACK_STATUSES.includes(track.status))
  if (active) {
    const title = splitGroupSourceTitle(active.title)
    if (active.status === 'extracting') {
      return `Downloading “${title}”`
    }
    if (active.status === 'leveling') {
      return `Leveling “${title}”`
    }
    if (active.status === 'uploading') {
      return `Uploading “${title}”`
    }
    if (active.status === 'transcoding') {
      return `Processing “${title}”`
    }
  }

  if (phase === 'planning') return 'Building save plan…'
  if (phase === 'posting') return 'Updating card on Yoto…'

  const pending = tracks.find(track => track.status === 'pending')
  if (pending) {
    return `Waiting for “${splitGroupSourceTitle(pending.title)}”`
  }

  return null
}

export function saveTrackCountMeta(tracks: SaveJobTrackProgress[]): string | null {
  if (tracks.length === 0) return null

  const done = tracks.filter(track =>
    track.status === 'ready' || track.status === 'skipped',
  ).length

  if (done === 0) return null
  return `${done} of ${tracks.length} tracks done`
}

/** @deprecated Use saveOverallLabel / saveOperationLabel */
export function savePhaseLabel(phase: SaveJobPhase): string {
  return saveOverallLabel(phase)
}

/** @deprecated Use saveOperationLabel */
export function saveCurrentTrackMeta(tracks: SaveJobTrackProgress[]): string | null {
  return saveOperationLabel('uploading', tracks)
}
