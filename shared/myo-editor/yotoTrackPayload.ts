import type { YotoTrackPayload, YotoTrackReuseSnapshot } from './types'

export type YotoDisplayIcon = { icon16x16: string | null }

export function resolveDisplayIcon(
  ...candidates: Array<YotoDisplayIcon | undefined>
): YotoDisplayIcon {
  for (const candidate of candidates) {
    const icon = candidate?.icon16x16
    if (icon) {
      return { icon16x16: icon }
    }
  }
  return { icon16x16: null }
}

export function toYotoTrackReuseSnapshot(
  track: YotoTrackPayload,
): YotoTrackReuseSnapshot {
  return {
    trackUrl: track.trackUrl,
    type: track.type,
    format: track.format,
    duration: track.duration,
    fileSize: track.fileSize,
    channels: track.channels,
    display: track.display,
    uid: track.uid,
  }
}

export function toYotoTrackPayload(
  snapshot: YotoTrackReuseSnapshot,
  title: string,
  key: string,
  overlayLabel: string,
): YotoTrackPayload {
  return {
    key,
    title,
    overlayLabel,
    trackUrl: snapshot.trackUrl,
    type: snapshot.type,
    format: snapshot.format,
    duration: snapshot.duration,
    fileSize: snapshot.fileSize,
    channels: snapshot.channels,
    display: snapshot.display ?? { icon16x16: null },
    uid: snapshot.uid,
  }
}
