import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Modal from '../components/Modal'
import { money, paymentMethods, methodLabel } from '../format'
import { downloadInvoice, shareInvoice, shareNotice, invoiceNumber } from '../invoice'

function orderTotal(order) {
  let total = 0
  for (const item of order.order_items) total += item.qty * item.price
  return total
}

function orderPaid(order) {
  let paid = 0
  for (const p of order.payments) paid += Number(p.amount)
  return paid
}

function orderBalance(order) {
  return Math.max(0, orderTotal(order) - orderPaid(order))
}

function hasPending(order) {
  return order.order_items.some((item) => item.pending_qty > 0)
}

function PaymentForm({ order, balance, onSaved }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.rpc('record_order_payment', {
      p_order_id: order.id,
      p_amount: Math.round(Number(amount) * 100) / 100,
      p_method: method,
      p_note: note || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setAmount('')
    setNote('')
    onSaved()
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

function OrderDetail({ order, onClose, onChanged }) {
  const [confirmItem, setConfirmItem] = useState(null)
  const [shareNote, setShareNote] = useState('')
  const total = orderTotal(order)
  const paid = orderPaid(order)
  const balance = orderBalance(order)

  async function markDelivered() {
    await supabase.rpc('mark_delivered', { p_item_id: confirmItem.id })
    setConfirmItem(null)
    onChanged()
  }

  function invoiceData() {
    return {
      invoiceNumber: invoiceNumber(order.order_number),
      date: order.created_at,
      dueDate: order.due_date,
      customer: order.customers,
      salesperson: order.profiles?.full_name || '',
      paid,
      previousBalance: Number(order.previous_balance || 0),
      items: order.order_items.map((item) => ({
        name: item.products.name,
        qty: item.qty,
        price: item.price,
        pending_qty: item.pending_qty,
      })),
    }
  }

  return (
    <Modal title={invoiceNumber(order.order_number)} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-400">Customer</div>
          <div className="font-semibold">{order.customers?.name}</div>
          <div className="text-slate-500">{order.customers?.phone}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Sold by</div>
          <div className="font-semibold">{order.profiles?.full_name}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Date</div>
          <div className="font-semibold">{new Date(order.created_at).toLocaleString()}</div>
          {order.due_date && balance > 0.005 && (
            <div className="text-slate-500">Due {new Date(order.due_date).toLocaleDateString()}</div>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr><th className="py-2">Item</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th><th className="py-2"></th></tr>
        </thead>
        <tbody>
          {order.order_items.map((item) => {
            const pending = item.pending_qty > 0
            return (
              <tr key={item.id} className={'border-t border-slate-100 ' + (pending ? 'bg-red-50 text-red-700' : '')}>
                <td className="py-3 font-medium">{item.products.name}</td>
                <td className="py-3 text-center">{item.qty}</td>
                <td className="py-3 text-right">{money(item.price)}</td>
                <td className="py-3 text-right font-semibold">{money(item.qty * item.price)}</td>
                <td className="py-3 text-right">
                  {pending && (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs font-semibold">{item.pending_qty} owed</span>
                      <button onClick={() => setConfirmItem(item)}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">
                        Mark delivered
                      </button>
                    </div>
                  )}
                  {!pending && item.delivered_at && (
                    <span className="text-xs text-emerald-600">Delivered {new Date(item.delivered_at).toLocaleDateString()}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></div>

      <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Order total</span><span className="font-semibold">{money(total)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-semibold text-emerald-600">{money(paid)}</span></div>
        <div className="flex justify-between text-base">
          <span className="font-semibold">Balance</span>
          <span className={'font-bold ' + (balance > 0.005 ? 'text-red-600' : 'text-emerald-600')}>
            {balance > 0.005 ? money(balance) : 'Paid in full'}
          </span>
        </div>
      </div>

      {order.payments.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-slate-400">Payments</div>
          <div className="mt-1 divide-y divide-slate-100 text-sm">
            {[...order.payments].sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map((p) => (
              <div key={p.id} className="flex justify-between py-2">
                <span className="text-slate-600">
                  {new Date(p.paid_at).toLocaleDateString()} · {methodLabel(p.method)}{p.note ? ' · ' + p.note : ''}
                </span>
                <span className="font-semibold">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {balance > 0.005 && <PaymentForm order={order} balance={balance} onSaved={onChanged} />}

      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={() => downloadInvoice(invoiceData())} className="btn-ghost">Download invoice</button>
        <button onClick={async () => setShareNote(shareNotice(await shareInvoice(invoiceData())))} className="btn-ghost">Share</button>
      </div>
      {shareNote && <p className="mt-3 text-sm text-slate-500">{shareNote}</p>}

      {confirmItem && (
        <Modal title="Mark as delivered?" onClose={() => setConfirmItem(null)}>
          <p className="text-sm text-slate-600">
            {confirmItem.pending_qty} × {confirmItem.products.name} will be marked as delivered to {order.customers?.name}.
            Stock levels are not changed.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setConfirmItem(null)} className="btn-ghost">Cancel</button>
            <button onClick={markDelivered} className="btn">Yes, delivered</button>
          </div>
        </Modal>
      )}
    </Modal>
  )
}

const filters = [
  ['all', 'All'],
  ['unpaid', 'Unpaid'],
  ['pending', 'Pending delivery'],
]

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, created_at, due_date, previous_balance, customers(name, phone, location), profiles(full_name), order_items(id, qty, price, pending_qty, delivered_at, products(name)), payments(id, amount, method, note, paid_at)')
      .order('created_at', { ascending: false })
    setOrders(data || [])
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const shown = orders.filter((o) => {
    const text = (invoiceNumber(o.order_number) + ' #' + o.order_number + ' ' + (o.customers?.name || '') + ' ' + (o.profiles?.full_name || '')).toLowerCase()
    if (!text.includes(search.toLowerCase())) return false
    if (filter === 'pending' && !hasPending(o)) return false
    if (filter === 'unpaid' && orderBalance(o) <= 0.005) return false
    return true
  })

  const selected = orders.find((o) => o.id === selectedId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">Everything sold by the team: who, to whom, when and what is still owed.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <input className="input md:max-w-sm" placeholder="Search by invoice, customer or salesperson" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={'shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ' +
                (filter === key ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-3">Invoice</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Salesperson</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((order) => {
              const balance = orderBalance(order)
              return (
                <tr key={order.id} onClick={() => setSelectedId(order.id)}
                  className={'cursor-pointer border-t border-slate-100 hover:bg-slate-50 ' + (hasPending(order) ? 'bg-red-50/50' : '')}>
                  <td className="px-5 py-3 font-medium">
                    {invoiceNumber(order.order_number)}
                    {hasPending(order) && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">pending</span>
                    )}
                  </td>
                  <td className="px-5 py-3">{order.customers?.name}</td>
                  <td className="px-5 py-3 text-slate-500">{order.profiles?.full_name}</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right font-semibold">{money(orderTotal(order))}</td>
                  <td className={'px-5 py-3 text-right font-semibold ' + (balance > 0.005 ? 'text-red-600' : 'text-emerald-600')}>
                    {balance > 0.005 ? money(balance) : 'Paid'}
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-400">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <OrderDetail order={selected} onClose={() => setSelectedId(null)} onChanged={load} />}
    </div>
  )
}
