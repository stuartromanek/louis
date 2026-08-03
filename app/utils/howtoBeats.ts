import howtoSearchArt from '~/assets/images/howto/search.png'
import howtoAddArt from '~/assets/images/howto/add.png'
import howtoListenArt from '~/assets/images/howto/listen.png'

export const PLACEHOLDER_COLORS = [
  { bg: 'bg-maru-yellow', text: 'text-maru-black' },
  { bg: 'bg-maru-blue-light', text: 'text-maru-black' },
  { bg: 'bg-maru-green-light', text: 'text-maru-black' },
  { bg: 'bg-maru-magenta-light', text: 'text-maru-black' },
  { bg: 'bg-maru-orange', text: 'text-maru-black' },
  { bg: 'bg-maru-turquoise-light', text: 'text-maru-black' },
] as const

export function colorForIndex(index: number) {
  return PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length]!
}

export const HOWTO_BEATS = [
  {
    title: 'Search',
    body: 'Find a song, show, or artist.',
    art: howtoSearchArt,
    artAlt: 'Magnifying glass over a search window',
  },
  {
    title: 'Add',
    body: 'Drop it onto your MYO card.',
    art: howtoAddArt,
    artAlt: 'App window loading a track onto a card',
  },
  {
    title: 'Listen',
    body: 'Play your card on the Yoto.',
    art: howtoListenArt,
    artAlt: 'Smiling face listening on headphones',
  },
] as const
