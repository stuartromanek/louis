export const EMOJI_IDS = [
  '1stPlaceMedal',
  'Alien',
  'AlienMonster',
  'AmericanFootball',
  'AngryFace',
  'AngryFaceWithHorns',
  'AnguishedFace',
  'AnnoyedFaceWithTongue',
  'ArtistPalette',
  'AtomSymbol',
  'Avocado',
  'BabyChick',
  'Bacon',
  'Bagel',
  'BaguetteBread',
  'Balloon',
  'Banana',
  'Basketball',
  'BeamingFaceWithSmilingEyes',
  'Bear',
  'Beaver',
  'Beetle',
  'BellPepper',
  'BilledCap',
  'Blossom',
  'BouleBread',
  'Butterfly',
  'Cactus',
  'Candy',
  'Chicken',
  'ClownFace',
  'CowboyHatFace',
  'Cupcake',
  'DisguisedFace',
  'Doughnut',
  'Duck',
  'Delete',
  'Dvd',
  'Ear',
  'ElectricPlugRed',
  'FaceHoldingBackTears',
  'FaceWithPeekingEye',
  'FerrisWheel',
  'Fire',
  'FloppyDisk',
  'FlyingSaucer',
  'Headphone',
  'HotDog',
  'KiwiFruit',
  'LevelSlider',
  'LightBulb',
  'LyingFace',
  'MagnifyingGlass',
  'MusicalKeyboard',
  'MusicalNote',
  'MusicalNotes',
  'Ogre',
  'Onion',
  'OpticalDisk',
  'PlasticBottle',
  'PotOfFood',
  'RollerSkate',
  'RollingOnTheFloorLaughing',
  'ShushingFace',
  'ThreeFingerOperation',
  'Videocassette',
  'VideoGame',
  'WarningStrip',
] as const

export type EmojiId = (typeof EMOJI_IDS)[number]

export function emojiPath(id: EmojiId): string {
  return `/emoji/${id}.svg`
}

export function pickRandomEmoji(): EmojiId {
  return EMOJI_IDS[Math.floor(Math.random() * EMOJI_IDS.length)]!
}

export function shuffleEmojis(count: number): EmojiId[] {
  const pool = [...EMOJI_IDS]
  const picked: EmojiId[] = []
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(index, 1)[0]!)
  }
  return picked
}
