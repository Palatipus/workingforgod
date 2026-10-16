import { useEffect, useState } from 'react'
import { disablePush, enablePush, needsHomeScreen, pushEnabledHere, pushPermission, pushSupported } from '../push'
import { errorText } from '../errors'

const DISMISSED = 'push-prompt-dismissed'
const ASK_AGAIN_DAYS = 7
const canAsk = pushSupported || (needsHomeScreen && !!import.meta.env.VITE_VAPID_PUBLIC_KEY && import.meta.env.PROD)

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED))
    return at && Date.now() - at < ASK_AGAIN_DAYS * 86400000
  } catch { return false }
}

// Banner asking each person to turn on phone notifications (until they do, or for a week after "Not now")
export default function PushPrompt() {
  const [show, setShow] = useState(() => canAsk && pushPermission() === 'default' && !recentlyDismissed())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!show) return null

  function dismiss() {
    try { localStorage.setItem(DISMISSED, String(Date.now())) } catch { /* fine, it just asks again */ }
    setShow(false)
  }

  async function turnOn() {
    setBusy(true)
    setError('')
    try {
      await enablePush()
      setShow(false)
    } catch (err) {
      setError(errorText(err))
    }
    setBusy(false)
  }

  return (
    <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <div className="font-semibold">Get notifications on this phone</div>
      {needsHomeScreen ? (
        <p className="mt-0.5">
          On iPhone, first add the app to your Home Screen (tap Share, then "Add to Home Screen"),
          then open it from there to turn on notifications.
        </p>
      ) : (
        <p className="mt-0.5">New orders, approvals and payments will pop up even when the app is closed.</p>
      )}
      {error && <p className="mt-1 text-red-600">{error}</p>}
      <div className="mt-2.5 flex gap-2">
        {!needsHomeScreen && <button onClick={turnOn} disabled={busy} className="btn !py-1.5">{busy ? 'Turning on...' : 'Turn on'}</button>}
        <button onClick={dismiss} className="btn-ghost !py-1.5">Not now</button>
      </div>
    </div>
  )
}

// On/off switch for this device, shown on the Notifications page
export function PushToggle() {
  const [on, setOn] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { pushEnabledHere().then(setOn) }, [])

  if (!canAsk) return null

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      if (on) {
        await disablePush()
        setOn(false)
      } else {
        const ok = await enablePush()
        setOn(ok)
        if (!ok) setError(pushPermission() === 'denied'
          ? 'Notifications are blocked for this app. Allow them in your phone or browser settings, then try again.'
          : 'Notifications were not allowed.')
      }
    } catch (err) {
      setError(errorText(err))
    }
    setBusy(false)
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="text-sm">
        <div className="font-semibold">Phone notifications</div>
        <div className="text-slate-500">
          {needsHomeScreen
            ? 'Add the app to your Home Screen and open it from there to turn these on.'
            : on ? 'On for this device.' : 'Off for this device.'}
        </div>
        {error && <div className="mt-1 text-red-600">{error}</div>}
      </div>
      {!needsHomeScreen && on !== null && (
        <button onClick={toggle} disabled={busy} className={on ? 'btn-ghost' : 'btn'}>
          {busy ? 'Please wait...' : on ? 'Turn off' : 'Turn on'}
        </button>
      )}
    </div>
  )
}
