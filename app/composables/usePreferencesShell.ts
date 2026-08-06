/**
 * Shared Preferences open state so status bar, mobile header, auth gate,
 * and desktop first-run can open the same modal.
 */
export function usePreferencesShell() {
  const open = useState('user-preferences-open', () => false)

  function openPreferences() {
    open.value = true
  }

  function closePreferences() {
    open.value = false
  }

  return {
    open,
    openPreferences,
    closePreferences,
  }
}
