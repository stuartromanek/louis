import type { Ref } from 'vue'
import type { PlaylistTrack } from '~/components/playlist/types'

export function usePlaylistEnterStagger(playlist: Ref<PlaylistTrack[]>) {
  const staggerById = shallowRef(new Map<string, number>())
  const knownIds = new Set(playlist.value.map(track => track.id))

  watch(playlist, (tracks) => {
    const added: string[] = []
    const nextIds = new Set<string>()
    for (const track of tracks) {
      nextIds.add(track.id)
      if (!knownIds.has(track.id)) added.push(track.id)
    }
    knownIds.clear()
    for (const id of nextIds) knownIds.add(id)
    staggerById.value = added.length > 1
      ? new Map(added.map((id, index) => [id, index]))
      : new Map()
  })

  function enterIndex(id: string) {
    return staggerById.value.get(id) ?? 0
  }

  return { enterIndex }
}
