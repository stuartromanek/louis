export type TypewriterCycleOptions = {
  phrases: string[]
  onUpdate: (text: string) => void
  typeMs?: number
  deleteMs?: number
  holdMs?: number
  gapMs?: number
}

export type TypewriterCycle = {
  start: () => void
  stop: () => void
}

export function createTypewriterCycle({
  phrases,
  onUpdate,
  typeMs = 70,
  deleteMs = 40,
  holdMs = 1600,
  gapMs = 400,
}: TypewriterCycleOptions): TypewriterCycle {
  let stopped = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let phraseIndex = 0

  function clear() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  function schedule(fn: () => void, ms: number) {
    clear()
    timeoutId = setTimeout(() => {
      timeoutId = null
      if (!stopped) fn()
    }, ms)
  }

  function typePhrase(phrase: string, charIndex: number) {
    if (stopped) return
    onUpdate(phrase.slice(0, charIndex))
    if (charIndex < phrase.length) {
      schedule(() => typePhrase(phrase, charIndex + 1), typeMs)
      return
    }
    schedule(() => erasePhrase(phrase, phrase.length), holdMs)
  }

  function erasePhrase(phrase: string, charIndex: number) {
    if (stopped) return
    onUpdate(phrase.slice(0, charIndex))
    if (charIndex > 0) {
      schedule(() => erasePhrase(phrase, charIndex - 1), deleteMs)
      return
    }
    phraseIndex = (phraseIndex + 1) % phrases.length
    schedule(() => typePhrase(phrases[phraseIndex]!, 0), gapMs)
  }

  function start() {
    if (stopped || phrases.length === 0) return
    phraseIndex = 0
    typePhrase(phrases[0]!, 0)
  }

  function stop() {
    stopped = true
    clear()
    onUpdate('')
  }

  return { start, stop }
}
