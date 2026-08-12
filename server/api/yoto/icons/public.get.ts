import { fetchPublicYotoIcons, normalizeIconUrl } from '../../../utils/yoto-icons'

export default defineEventHandler(async (event) => {
  const icons = await fetchPublicYotoIcons(event)

  return {
    icons: icons
      .filter(icon => icon.mediaId)
      .map(icon => ({
        mediaId: icon.mediaId,
        displayIconId: icon.displayIconId ?? null,
        title: icon.title ?? '',
        tags: icon.publicTags ?? [],
        url: normalizeIconUrl(icon.url, icon.mediaId),
        source: 'yoto' as const,
      }))
      .filter(icon => Boolean(icon.url)),
  }
})
