/** Playlist meters are Yoto chapter/duration caps — not free space on the Louis volume. */
export const HOST_DISK_FULL_MESSAGE
  = 'This machine is out of disk space (the Louis audio folder, not the playlist tracks/time meters). Free space on the Docker/Home Assistant volume (`/data/audio`) or the desktop disk, then try Update again.'

export function looksLikeHostDiskFull(text: string): boolean {
  return (
    /\bENOSPC\b/i.test(text)
    || /\[Errno 28\]/i.test(text)
    || /no space left on device/i.test(text)
    || /not enough space on the disk/i.test(text)
  )
}

export function hostDiskFullMessageIfMatch(text: string): string | null {
  return looksLikeHostDiskFull(text) ? HOST_DISK_FULL_MESSAGE : null
}

export function isHostDiskFullError(err: unknown): boolean {
  if (typeof err === 'object' && err && 'code' in err && String((err as { code?: string }).code) === 'ENOSPC') {
    return true
  }
  const text = err instanceof Error ? err.message : String(err ?? '')
  return looksLikeHostDiskFull(text)
}
