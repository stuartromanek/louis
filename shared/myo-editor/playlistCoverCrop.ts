/**
 * Yoto `coverType=default` (autoconvert) serves 638×1011, not 5:7.
 * Crop, export, and library cards share this frame so `imageL` fills the pane.
 */
export const PLAYLIST_COVER_EXPORT_WIDTH = 638
export const PLAYLIST_COVER_EXPORT_HEIGHT = 1011
export const PLAYLIST_COVER_ASPECT_WIDTH = PLAYLIST_COVER_EXPORT_WIDTH
export const PLAYLIST_COVER_ASPECT_HEIGHT = PLAYLIST_COVER_EXPORT_HEIGHT
/** Zoom 1 = object-fit contain (full image visible). */
export const PLAYLIST_COVER_ZOOM_MIN = 1
export const PLAYLIST_COVER_ZOOM_MAX = 4
/** Letterbox behind contain; must match the crop stage. */
export const PLAYLIST_COVER_LETTERBOX = '#000000'

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
  /** -1..1, 0 is centered. Unused until dest overflows the frame. */
  panX: number
  panY: number
}

export type CoverDestRect = {
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

export function coverFitScale(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number = PLAYLIST_COVER_EXPORT_WIDTH,
  frameHeight: number = PLAYLIST_COVER_EXPORT_HEIGHT,
): { contain: number, cover: number } {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !(frameWidth > 0) || !(frameHeight > 0)) {
    return { contain: 1, cover: 1 }
  }
  return {
    contain: Math.min(frameWidth / imageWidth, frameHeight / imageHeight),
    cover: Math.max(frameWidth / imageWidth, frameHeight / imageHeight),
  }
}

/** Zoom at which the image fills the Yoto cover frame (object-fit: cover). */
export function coverFitZoom(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number = PLAYLIST_COVER_EXPORT_WIDTH,
  frameHeight: number = PLAYLIST_COVER_EXPORT_HEIGHT,
): number {
  const { contain, cover } = coverFitScale(imageWidth, imageHeight, frameWidth, frameHeight)
  if (!(contain > 0)) return 1
  return cover / contain
}

function destSize(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  frameWidth: number,
  frameHeight: number,
): { width: number, height: number } {
  const { contain } = coverFitScale(imageWidth, imageHeight, frameWidth, frameHeight)
  const z = clamp(zoom, PLAYLIST_COVER_ZOOM_MIN, PLAYLIST_COVER_ZOOM_MAX)
  return {
    width: imageWidth * contain * z,
    height: imageHeight * contain * z,
  }
}

function axisOrigin(slack: number, pan: number): number {
  if (slack >= 0) return slack / 2
  return slack / 2 + pan * (slack / 2)
}

/** Image placement in the Yoto cover frame. Zoom 1 is contain; canvas clips when dest overflows. */
export function coverDestRect(
  imageWidth: number,
  imageHeight: number,
  crop: CoverCrop,
  frameWidth: number = PLAYLIST_COVER_EXPORT_WIDTH,
  frameHeight: number = PLAYLIST_COVER_EXPORT_HEIGHT,
): CoverDestRect {
  const next = clampCoverCrop(crop)
  const { width, height } = destSize(imageWidth, imageHeight, next.zoom, frameWidth, frameHeight)
  return {
    x: axisOrigin(frameWidth - width, next.panX),
    y: axisOrigin(frameHeight - height, next.panY),
    width,
    height,
  }
}

export function panFromDestOrigin(
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  destX: number,
  destY: number,
  frameWidth: number = PLAYLIST_COVER_EXPORT_WIDTH,
  frameHeight: number = PLAYLIST_COVER_EXPORT_HEIGHT,
): CoverCrop {
  const z = clamp(zoom, PLAYLIST_COVER_ZOOM_MIN, PLAYLIST_COVER_ZOOM_MAX)
  const { width, height } = destSize(imageWidth, imageHeight, z, frameWidth, frameHeight)
  const slackX = frameWidth - width
  const slackY = frameHeight - height
  return clampCoverCrop({
    zoom: z,
    panX: slackX >= 0 ? 0 : (destX - slackX / 2) / (slackX / 2),
    panY: slackY >= 0 ? 0 : (destY - slackY / 2) / (slackY / 2),
  })
}

export function coverImageStyle(imageWidth: number, imageHeight: number, crop: CoverCrop): {
  width: string
  height: string
  left: string
  top: string
} {
  const dest = coverDestRect(imageWidth, imageHeight, crop)
  return {
    width: `${(dest.width / PLAYLIST_COVER_EXPORT_WIDTH) * 100}%`,
    height: `${(dest.height / PLAYLIST_COVER_EXPORT_HEIGHT) * 100}%`,
    left: `${(dest.x / PLAYLIST_COVER_EXPORT_WIDTH) * 100}%`,
    top: `${(dest.y / PLAYLIST_COVER_EXPORT_HEIGHT) * 100}%`,
  }
}
