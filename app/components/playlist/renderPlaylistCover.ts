import {
  coverSourceRect,
  PLAYLIST_COVER_EXPORT_HEIGHT,
  PLAYLIST_COVER_EXPORT_WIDTH,
  PLAYLIST_COVER_UPLOAD_MAX_BYTES,
  type CoverCrop,
} from '#shared/myo-editor/playlistCoverCrop'

export function loadCoverImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image.'))
    img.src = src
  })
}

export async function renderPlaylistCoverPng(
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  crop: CoverCrop,
): Promise<Blob> {
  const rect = coverSourceRect(imageWidth, imageHeight, crop)
  const canvas = document.createElement('canvas')
  canvas.width = PLAYLIST_COVER_EXPORT_WIDTH
  canvas.height = PLAYLIST_COVER_EXPORT_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not crop that image.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    PLAYLIST_COVER_EXPORT_WIDTH,
    PLAYLIST_COVER_EXPORT_HEIGHT,
  )
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) throw new Error('Could not crop that image.')
  if (blob.size > PLAYLIST_COVER_UPLOAD_MAX_BYTES) {
    throw new Error('Cropped image is too large. Try a smaller photo.')
  }
  return blob
}
