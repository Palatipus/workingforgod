import { useState } from 'react'
import Modal from './Modal'

// A yes/no dialog for actions that change money or stock. onConfirm returns an error message, or nothing on success.
export default function ConfirmDialog({ title, text, confirmLabel, children, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function go() {
    setBusy(true)
    setError('')
    const message = await onConfirm()
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{text}</p>
      {children}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Go back</button>
        <button disabled={busy} onClick={go}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? 'Saving...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
