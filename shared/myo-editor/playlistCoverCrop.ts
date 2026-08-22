/** Yoto playlist cards are 5×7. Export large enough for imageL. */
export const PLAYLIST_COVER_ASPECT_WIDTH = 5
export const PLAYLIST_COVER_ASPECT_HEIGHT = 7
export const PLAYLIST_COVER_EXPORT_WIDTH = 640
export const PLAYLIST_COVER_EXPORT_HEIGHT = 896
export const PLAYLIST_COVER_ZOOM_MIN = 1
export const PLAYLIST_COVER_ZOOM_MAX = 4

export const PLAYLIST_COVER_ACCEPT
  = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

/** Soft cap on the source photo; the cropped PNG is much smaller. */
export const PLAYLIST_COVER_SOURCE_MAX_BYTES = 12 * 1024 * 1024
export const PLAYLIST_COVER_UPLOAD_MAX_BYTES = 1_500_000

export type CoverCrop = {
  zoom: number
  /** -1..1, 0 is centered. */
  panX: number
  panY: number
}

export type CoverSourceRect = {
  x: number
  y: number
  width: number
  height: number
}

export function playlistCoverAspect(): number {
  return PLAYLIST_COVER_ASPECT_WIDTH / PLAYLIST_COVER_ASPECT_HEIGHT
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i < 0) return ''
  return filename.slice(i + 1).toLowerCase()
}

export function isPlaylistCoverFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase()
  if (mime && ALLOWED_MIME.has(mime)) return true
  return ALLOWED_EXT.has(extensionOf(file.name))
}

export function playlistCoverFileError(file: File | null | undefined): string | null {
  if (!file || file.size <= 0) return 'Choose an image to upload.'
  if (!isPlaylistCoverFile(file)) return 'Use a JPG, PNG, WebP, or GIF.'
  if (file.size > PLAYLIST_COVER_SOURCE_MAX_BYTES) return 'That photo is too large (max 12 MB).'
  return null
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampCoverCrop(crop: CoverCrop): CoverCrop {
  return {
    zoom: clamp(crop.zoom, PLAYLIST_COVER_ZOOM_MIN, PLAYLIST_COVER_ZOOM_MAX),
    panX: clamp(crop.panX, -1, 1),
    panY: clamp(crop.panY, -1, 1),
  }
}

/** Smallest 5:7 window that still covers the image (object-fit: cover at zoom 1). */
export function minCoverCropSize(imageWidth: number, imageHeight: number): { width: number; height: number } {
  const frame = playlistCoverAspect()
  const image = imageWidth / imageHeight
  if (image > frame) {
    return { width: imageHeight * frame, height: imageHeight }
  }
  return { width: imageWidth, height: imageWidth / frame }
}

export function coverSourceRect(
  imageWidth: number,
  imageHeight: number,
  crop: CoverCrop,
): CoverSourceRect {
  const zoom = clamp(crop.zoom, PLAYLIST_COVER_ZOOM_MIN, PLAYLIST_COVER_ZOOM_MAX)
  const min = minCoverCropSize(imageWidth, imageHeight)
  const width = min.width / zoom
  const height = min.height / zoom
  const maxX = Math.max(0, imageWidth - width)
  const maxY = Math.max(0, imageHeight - height)
  const panX = clamp(crop.panX, -1, 1)
  const panY = clamp(crop.panY, -1, 1)
  return {
    x: maxX / 2 + panX * (maxX / 2),
    y: maxY / 2 + panY * (maxY / 2),
    width,
    height,
  }
}

export function panFromSourceOrigin(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  x: number,
  y: number,
): CoverCrop {
  const min = minCoverCropSize(imageWidth, imageHeight)
  const z = clamp(zoom, PLAYLIST_COVER_ZOOM_MIN, PLAYLIST_COVER_ZOOM_MAX)
  const width = min.width / z
  const height = min.height / z
  const maxX = Math.max(0, imageWidth - width)
  const maxY = Math.max(0, imageHeight - height)
  return clampCoverCrop({
    zoom: z,
    panX: maxX <= 0 ? 0 : ((x - maxX / 2) / (maxX / 2)),
    panY: maxY <= 0 ? 0 : ((y - maxY / 2) / (maxY / 2)),
  })
}

export function coverImageStyle(imageWidth: number, imageHeight: number, crop: CoverCrop): {
  width: string
  height: string
  left: string
  top: string
} {
  const rect = coverSourceRect(imageWidth, imageHeight, crop)
  return {
    width: `${(imageWidth / rect.width) * 100}%`,
    height: `${(imageHeight / rect.height) * 100}%`,
    left: `${(-rect.x / rect.width) * 100}%`,
    top: `${(-rect.y / rect.height) * 100}%`,
  }
}
