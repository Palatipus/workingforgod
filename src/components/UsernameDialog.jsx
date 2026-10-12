import { useState } from 'react'
import { supabase } from '../supabase'
import Modal from './Modal'
import { cleanUsername, validUsername, usernameRule } from '../format'

// Choose or change a username. With `person`, an admin sets it for someone else.
export default function UsernameDialog({ person, current, title, intro, onClose, onSaved }) {
  const [value, setValue] = useState(current || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const name = cleanUsername(value)

  async function save(e) {
    e.preventDefault()
    if (!validUsername(name)) {
      setError(usernameRule)
      return
    }
    setSaving(true)
    setError('')
    const { error } = person
      ? await supabase.rpc('set_user_username', { p_user: person.id, p_username: name })
      : await supabase.rpc('set_my_username', { p_username: name })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved(name)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {intro && <p className="text-sm text-slate-600">{intro}</p>}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
          <input className="input !pl-8" value={value} onChange={(e) => setValue(e.target.value)} autoFocus
            autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder="e.g. kofi.mensah" />
        </div>
        <p className="text-xs text-slate-400">3-30 characters: letters, numbers, dots, dashes or underscores. Capital letters don't matter when logging in.</p>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">{current ? 'Cancel' : 'Later'}</button>
          <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save username'}</button>
        </div>
      </form>
    </Modal>
  )
}
