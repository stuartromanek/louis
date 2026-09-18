import { getYoutubePreviewAudio } from '../../../../utils/youtube-download'
import { computeAudioPeaks, parsePeakWindow } from '../../../../utils/ffmpeg-peaks'
import { withPipelineContext } from '../../../../utils/pipeline-log'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid YouTube video id' })
  }

  const window = parsePeakWindow(getQuery(event) as Record<string, unknown>)
  const audio = await withPipelineContext(
    { surface: 'preview', videoId: id, requestId: crypto.randomUUID() },
    () => getYoutubePreviewAudio(id, event),
  )
  const peaks = await computeAudioPeaks(audio.filePath, { window })
  if (!peaks) {
    throw createError({ statusCode: 502, statusMessage: 'Could not read waveform' })
  }

  setHeader(event, 'Cache-Control', audio.fromCache ? 'private, max-age=3600' : 'private, max-age=300')
  return peaks
})
