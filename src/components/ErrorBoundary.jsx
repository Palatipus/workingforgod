import { Component } from 'react'

// After a new version is deployed, pages that weren't loaded yet have new file names, so opening them
// fails in an app that was already open. Reloading once fetches the new version.
export function isStaleVersion(error) {
  const text = String(error?.message || error)
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|ChunkLoadError|Loading chunk/i.test(text)
}

const RELOAD_KEY = 'wfg-reloaded-for-update'

// Reload once to pick up a new version (never loops: the flag stops a second automatic reload)
export function reloadForUpdate() {
  let alreadyTried = false
  try { alreadyTried = sessionStorage.getItem(RELOAD_KEY) === '1' } catch { /* storage blocked */ }
  if (alreadyTried) return false
  try { sessionStorage.setItem(RELOAD_KEY, '1') } catch { /* storage blocked */ }
  window.location.reload()
  return true
}

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    if (isStaleVersion(error)) reloadForUpdate()
  }

  componentDidMount() {
    // A successful load clears the flag, so the next update can reload again
    setTimeout(() => { try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* storage blocked */ } }, 10000)
  }

  render() {
    if (!this.state.error) return this.props.children
    const stale = isStaleVersion(this.state.error)
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <img src="/logo.png" alt="" className="mx-auto mb-5 h-14 w-14" />
          <h1 className="text-lg font-bold">{stale ? 'The app was updated' : 'Something went wrong'}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {stale
              ? 'Reload to get the latest version.'
              : 'Reload the page. Your saved work is safe. If this keeps happening, tell your admin what you were doing.'}
          </p>
          <button onClick={() => window.location.reload()} className="btn mt-6 w-full !py-2.5">Reload</button>
        </div>
      </div>
    )
  }
}
