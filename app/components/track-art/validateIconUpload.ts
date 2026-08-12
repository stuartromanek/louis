/** Yoto custom icon guidelines (support.yotoplay.com / yoto.dev). */

export const YOTO_ICON_ACCEPT
  = 'image/png,image/gif,image/jpeg,image/tiff,image/svg+xml,.png,.gif,.jpg,.jpeg,.tif,.tiff,.svg'

const ALLOWED_MIME = new Set([
  'image/png',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
  'image/tif',
  'image/svg+xml',
])

const ALLOWED_EXT = new Set([
  'png',
  'gif',
  'jpg',
  'jpeg',
  'tif',
  'tiff',
  'svg',
])

/** Soft cap — Yoto autoConverts; keep uploads reasonable. */
const MAX_BYTES = 512_000

export interface IconUploadValidation {
  ok: boolean
  error?: string
  /** Non-blocking tips (e.g. not 16×16 yet — autoConvert will help). */
  warnings: string[]
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i < 0) return ''
  return filename.slice(i + 1).toLowerCase()
}

function isAllowedType(file: File): boolean {
  const mime = (file.type || '').toLowerCase()
  if (mime && ALLOWED_MIME.has(mime)) return true
  return ALLOWED_EXT.has(extensionOf(file.name))
}

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  if ((file.type || '').includes('svg') || extensionOf(file.name) === 'svg') {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/**
 * Validate a user-picked file against Yoto custom-icon guidelines before upload.
 * Hard-fails on type/size; soft-warns on dimensions (autoConvert handles resize).
 */
export async function validateYotoIconFile(file: File): Promise<IconUploadValidation> {
  const warnings: string[] = []

  if (!file || file.size <= 0) {
    return { ok: false, error: 'Choose an image file to upload.', warnings }
  }

  if (!isAllowedType(file)) {
    return {
      ok: false,
      error: 'Use PNG, GIF, JPG, TIF, or SVG (Yoto custom icon formats).',
      warnings,
    }
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: 'Icon file is too large (max 512 KB). Try a smaller 16×16 PNG.',
      warnings,
    }
  }

  const size = await readImageSize(file)
  if (size) {
    if (size.width !== 16 || size.height !== 16) {
      warnings.push(
        `Image is ${size.width}×${size.height}. Yoto will auto-convert to 16×16 — for best results use a 16×16 PNG with transparency.`,
      )
    }
  }
  else if (extensionOf(file.name) !== 'svg' && !(file.type || '').includes('svg')) {
    warnings.push('Couldn’t read image dimensions. Upload may still work if Yoto accepts the file.')
  }

  warnings.push('Tip: avoid pure black pixels — they don’t show on the Yoto display.')

  return { ok: true, warnings }
}
