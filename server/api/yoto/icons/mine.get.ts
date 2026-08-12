import { fetchUserYotoIcons, normalizeIconUrl } from '../../../utils/yoto-icons'

export default defineEventHandler(async (event) => {
  const icons = await fetchUserYotoIcons(event)

  return {
    icons: icons
      .filter(icon => icon.mediaId)
      .map(icon => ({
        mediaId: icon.mediaId,
        displayIconId: icon.displayIconId ?? null,
        title: icon.title ?? '',
        url: normalizeIconUrl(icon.url, icon.mediaId) || null,
        source: 'user' as const,
      }))
      .filter(icon => Boolean(icon.url)),
  }
})
