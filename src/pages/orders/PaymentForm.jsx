import { useState } from 'react'
import { supabase } from '../../supabase'
import { paymentMethods } from '../../format'
import { errorText } from '../../errors'

// Record a payment against one order. Calls onSaved(receiptId).
export default function PaymentForm({ order, balance, onSaved }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('record_order_payment', {
      p_order_id: order.id,
      p_amount: Math.round(Number(amount) * 100) / 100,
      p_method: method,
      p_note: note || null,
    })
    setSaving(false)
    if (error) {
      setError(errorText(error))
      return
    }
    setAmount('')
    setNote('')
    onSaved(data)
  }

  return (
    <form onSubmit={save} className="mt-4 rounded-xl bg-slate-50 p-4">
      <div className="text-sm font-semibold">Record a payment</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Amount (GH₵)</label>
            <button type="button" onClick={() => setAmount(balance.toFixed(2))} className="text-xs font-medium text-indigo-600 hover:underline">
              Full balance
            </button>
          </div>
          <input className="input" type="number" min="0.01" step="0.01" max={balance} value={amount}
            onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-slate-500">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {paymentMethods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. MoMo ref" />
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="mt-3 flex justify-end">
        <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save payment'}</button>
      </div>
    </form>
  )
}
