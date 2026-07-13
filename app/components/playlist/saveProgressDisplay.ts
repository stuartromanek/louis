import type {
  SaveJobPhase,
  SaveJobTrackProgress,
  SaveTrackStatus,
} from '#shared/myo-editor/types'

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
  'uploading',
  'transcoding',
]

export function saveOverallLabel(phase: SaveJobPhase): string {
  return OVERALL_LABELS[phase] ?? 'Saving playlist…'
}

export function saveOperationLabel(
  phase: SaveJobPhase,
  tracks: SaveJobTrackProgress[],
): string | null {
  const active = tracks.find(track => ACTIVE_TRACK_STATUSES.includes(track.status))
  if (active) {
    if (active.status === 'extracting') {
      return `Downloading “${active.title}”`
    }
    if (active.status === 'uploading') {
      return `Uploading “${active.title}”`
    }
    if (active.status === 'transcoding') {
      return `Processing “${active.title}”`
    }
  }

  if (phase === 'planning') return 'Building save plan…'
  if (phase === 'posting') return 'Updating card on Yoto…'

  const pending = tracks.find(track => track.status === 'pending')
  if (pending) {
    return `Waiting for “${pending.title}”`
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
