import { useEffect, useState } from 'react'

// Chrome/Edge/Android fire this when the app can be installed. Keep it so a button can show the install prompt.
let deferred = null
const listeners = new Set()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  listeners.forEach((fn) => fn(true))
})
window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((fn) => fn(false))
})

export function useInstallPrompt() {
  const [available, setAvailable] = useState(!!deferred)
  useEffect(() => {
    listeners.add(setAvailable)
    return () => listeners.delete(setAvailable)
  }, [])

  async function install() {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    deferred = null
    setAvailable(false)
  }

  return { available, install }
}
