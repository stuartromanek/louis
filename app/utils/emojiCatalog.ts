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
  'Bell',
  'BellPepper',
  'BilledCap',
  'Blossom',
  'Books',
  'BouleBread',
  'Butterfly',
  'Cactus',
  'CallMeHand',
  'Candy',
  'CardFileBox',
  'CardIndex',
  'CardIndexDividers',
  'Chicken',
  'ClownFace',
  'Construction',
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
  'HighSpeedTrain',
  'Hole',
  'HotDog',
  'IndexPointingUp',
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
  'RedTrianglePointedUp',
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
