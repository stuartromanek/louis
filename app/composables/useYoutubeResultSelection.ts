const SELECTED_KEYS_STATE = 'youtube-result-selected-keys'
const IN_FLIGHT_KEYS_STATE = 'youtube-result-in-flight-keys'

export function useYoutubeResultSelection() {
  const selectedKeys = useState<string[]>(SELECTED_KEYS_STATE, () => [])
  const inFlightKeys = useState<string[]>(IN_FLIGHT_KEYS_STATE, () => [])

  const selectedKeySet = computed(() => new Set(selectedKeys.value))
  const selectedCount = computed(() => selectedKeys.value.length)
  const inFlightKeySet = computed(() => new Set(inFlightKeys.value))

  function setSelectedKeys(keys: Iterable<string>) {
    selectedKeys.value = [...new Set(keys)]
  }

  function addSelectedKeys(keys: Iterable<string>) {
    const next = new Set(selectedKeys.value)
    for (const key of keys) next.add(key)
    selectedKeys.value = [...next]
  }

  function toggle(key: string, next = !selectedKeySet.value.has(key)) {
    const set = new Set(selectedKeys.value)
    if (next) set.add(key)
    else set.delete(key)
    selectedKeys.value = [...set]
  }

  function clear() {
    if (selectedKeys.value.length === 0) return
    selectedKeys.value = []
  }

  function isSelected(key: string) {
    return selectedKeySet.value.has(key)
  }

  function setInFlightKeys(keys: Iterable<string>) {
    inFlightKeys.value = [...new Set(keys)]
  }

  function clearInFlight() {
    if (inFlightKeys.value.length === 0) return
    inFlightKeys.value = []
  }

  function isInFlight(key: string) {
    return inFlightKeySet.value.has(key)
  }

  return {
    selectedKeys,
    selectedKeySet,
    selectedCount,
    setSelectedKeys,
    addSelectedKeys,
    toggle,
    clear,
    isSelected,
    setInFlightKeys,
    clearInFlight,
    isInFlight,
  }
}
