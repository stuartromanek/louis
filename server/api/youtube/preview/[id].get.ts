import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { getYoutubePreviewAudio } from '../../../utils/youtube-download'

function previewMimeType(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case '.m4a': return 'audio/mp4'
    case '.webm': return 'audio/webm'
    case '.opus': return 'audio/opus'
    case '.mp3': return 'audio/mpeg'
    case '.ogg': return 'audio/ogg'
    default: return 'application/octet-stream'
  }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid YouTube video id' })
  }

  const audio = await getYoutubePreviewAudio(id, event)
  const fileStat = await stat(audio.filePath)
  const mime = previewMimeType(audio.filename)
  const size = fileStat.size

  setHeader(event, 'Accept-Ranges', 'bytes')
  setHeader(event, 'Content-Type', mime)
  setHeader(event, 'Cache-Control', audio.fromCache ? 'private, max-age=3600' : 'private, max-age=300')

  const range = getRequestHeader(event, 'range')
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range)
    if (match) {
      const start = Number(match[1])
      const end = match[2] ? Number(match[2]) : size - 1
      if (start >= size || end >= size || start > end) {
        throw createError({ statusCode: 416, statusMessage: 'Range Not Satisfiable' })
      }
      setResponseStatus(event, 206)
      setHeader(event, 'Content-Range', `bytes ${start}-${end}/${size}`)
      setHeader(event, 'Content-Length', String(end - start + 1))
      return sendStream(event, createReadStream(audio.filePath, { start, end }))
    }
  }

  setHeader(event, 'Content-Length', String(size))
  return sendStream(event, createReadStream(audio.filePath))
})
