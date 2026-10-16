import { useState } from 'react'
import { supabase } from '../../supabase'
import Modal from '../../components/Modal'
import { money, paymentMethods } from '../../format'
import { invoiceNumber } from '../../invoice'
import { itemLabel } from './itemLabel'
import { errorText } from '../../errors'

// Take items off an order (owed units first, then goods handed back), refunding if needed. Calls onDone(refundedAmount).
export default function ReturnDialog({ order, paid, isAdmin, onClose, onDone }) {
  const lines = order.order_items.filter((i) => i.qty > 0)
  const [qtys, setQtys] = useState({})
  const [restock, setRestock] = useState(true)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  let newTotal = 0
  let anyReturn = false
  let valid = true
  let delivered = 0
  for (const i of lines) {
    const raw = qtys[i.id] ?? ''
    const n = raw === '' ? 0 : Number(raw)
    if (!Number.isInteger(n) || n < 0 || n > i.qty) valid = false
    if (n > 0) anyReturn = true
    delivered += Math.max(0, n - i.pending_qty)
    newTotal += (i.qty - (Number.isInteger(n) ? n : 0)) * i.price
  }
  const refund = Math.max(0, paid - newTotal)
  const needsAdmin = refund > 0.005 && !isAdmin

  async function save() {
    setSaving(true)
    setError('')
    const items = lines.filter((i) => Number(qtys[i.id] || 0) > 0).map((i) => ({ item_id: i.id, qty: Number(qtys[i.id]) }))
    const { data, error } = await supabase.rpc('return_items', {
      p_order_id: order.id, p_items: items, p_reason: reason || null, p_restock: restock, p_refund_method: method,
    })
    setSaving(false)
    if (error) {
      setError(errorText(error))
      return
    }
    onDone(Number(data || 0))
  }

  return (
    <Modal title={'Return items: ' + invoiceNumber(order.order_number)} onClose={onClose} wide>
      <p className="text-sm text-slate-500">
        Enter how many of each item come off the order. Items still owed (not yet delivered) are taken off first;
        anything beyond that is goods the customer is handing back.
      </p>

      <div className="mt-4 divide-y divide-slate-100 text-sm">
        {lines.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="font-medium">{itemLabel(i)}</div>
              <div className="text-xs text-slate-400">
                {i.qty} on order{i.pending_qty > 0 ? ' · ' + i.pending_qty + ' not delivered yet' : ''} · {money(i.price)} each
              </div>
            </div>
            <input className="input !w-24" type="number" min="0" max={i.qty} step="1" placeholder="0"
              value={qtys[i.id] ?? ''} onChange={(e) => setQtys({ ...qtys, [i.id]: e.target.value })} />
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {delivered > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            <span>Put the {delivered} returned item{delivered === 1 ? '' : 's'} back into stock
              <span className="block text-xs text-slate-400">Untick if they are damaged or expired and can't be sold again.</span></span>
          </label>
        )}
        <input className="input" placeholder="Reason (optional), e.g. faulty, wrong item" value={reason}
          onChange={(e) => setReason(e.target.value)} />
      </div>

      {anyReturn && valid && (
        <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">New order total</span><span className="font-semibold">{money(newTotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Already paid</span><span className="font-semibold">{money(paid)}</span></div>
          {refund > 0.005 ? (
            <>
              <div className="flex justify-between text-base"><span className="font-semibold">Refund to customer</span>
                <span className="font-bold text-red-600">{money(refund)}</span></div>
              {isAdmin && (
                <div className="pt-2">
                  <label className="text-xs text-slate-500">Refund paid by</label>
                  <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {paymentMethods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-between"><span className="text-slate-500">Balance after return</span>
              <span className="font-semibold">{money(newTotal - paid)}</span></div>
          )}
        </div>
      )}

      {needsAdmin && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This return means giving money back, so an admin has to do it.
        </div>
      )}
      {!valid && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Each quantity must be a whole number, no more than what is on the order.</div>}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Go back</button>
        <button disabled={saving || !anyReturn || !valid || needsAdmin} onClick={save} className="btn">
          {saving ? 'Saving...' : refund > 0.005 ? 'Return and refund ' + money(refund) : 'Save return'}
        </button>
      </div>
    </Modal>
  )
}
