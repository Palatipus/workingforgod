import { useState } from 'react'
import { supabase } from '../supabase'
import Modal from './Modal'

// Change your own full name, or (admins, with `person`) someone else's
export default function NameDialog({ person, current, onClose, onSaved }) {
  const [name, setName] = useState(current || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    const clean = name.trim().replace(/\s+/g, ' ')
    if (clean.length < 2 || clean.length > 80) return setError('Name must be 2-80 characters.')
    setSaving(true)
    setError('')
    const { error } = person
      ? await supabase.rpc('set_user_name', { p_user: person.id, p_name: clean })
      : await supabase.rpc('set_my_name', { p_name: clean })
    setSaving(false)
    if (error) return setError(error.message)
    onSaved(clean)
  }

  return (
    <Modal title={person ? 'Name for ' + current : 'Change your name'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" />
        <p className="text-xs text-slate-400">Shown on orders, receipts and as "Sales representative" on new invoices.</p>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save name'}</button>
        </div>
      </form>
    </Modal>
  )
}
