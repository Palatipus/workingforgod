import { useState } from 'react'
import { supabase } from '../supabase'
import Modal from './Modal'

// Deliver some or all of an item still owed to a customer (takes it out of stock)
export default function DeliverDialog({ item, productName, customerName, onClose, onDone }) {
  const [qty, setQty] = useState(String(item.pending_qty))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const n = Number(qty)
  const valid = Number.isInteger(n) && n >= 1 && n <= item.pending_qty

  async function deliver() {
    setSaving(true)
    setError('')
    const { error } = await supabase.rpc('mark_delivered', { p_item_id: item.id, p_qty: n })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onDone()
  }

  return (
    <Modal title={'Deliver ' + productName} onClose={onClose}>
      <p className="text-sm text-slate-600">
        {item.pending_qty} still owed to {customerName}. The quantity you deliver is taken out of stock.
      </p>
      <label className="mt-4 block text-xs text-slate-500">Quantity delivered now</label>
      <input className={'input ' + (valid ? '' : '!border-red-400')} type="number" min="1" max={item.pending_qty} step="1"
        value={qty} onChange={(e) => setQty(e.target.value)} />
      {!valid && <div className="mt-1 text-xs text-red-600">Enter a whole number from 1 to {item.pending_qty}.</div>}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button disabled={saving || !valid} onClick={deliver} className="btn">{saving ? 'Saving...' : 'Mark delivered'}</button>
      </div>
    </Modal>
  )
}
