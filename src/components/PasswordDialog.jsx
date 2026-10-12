import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from './Modal'
import PasswordInput from './PasswordInput'

// Change your password while logged in. Checks the current password first.
export default function PasswordDialog({ onClose }) {
  const { session } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function save(e) {
    e.preventDefault()
    setError('')
    if (next.length < 6) return setError('The new password must be at least 6 characters.')
    if (next !== repeat) return setError('The two new passwords do not match.')
    if (next === current) return setError('The new password must be different from the current one.')

    setSaving(true)
    const check = await supabase.auth.signInWithPassword({ email: session.user.email, password: current })
    if (check.error) {
      setSaving(false)
      return setError('Your current password is wrong.')
    }
    const { error } = await supabase.auth.updateUser({ password: next })
    setSaving(false)
    if (error) return setError(error.message)
    setDone(true)
  }

  if (done) {
    return (
      <Modal title="Password changed" onClose={onClose}>
        <p className="text-sm text-slate-600">Use your new password next time you log in.</p>
        <div className="mt-6 flex justify-end"><button onClick={onClose} className="btn">Done</button></div>
      </Modal>
    )
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password" />
        <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (at least 6 characters)" autoComplete="new-password" />
        <PasswordInput value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="Type the new password again" autoComplete="new-password" />
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Change password'}</button>
        </div>
      </form>
    </Modal>
  )
}
