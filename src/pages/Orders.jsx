import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from '../components/Modal'
import { money, paymentMethods, methodLabel, searchTerm, today } from '../format'
import { downloadInvoice, shareInvoice, shareNotice, invoiceNumber, loadPdf } from '../invoice'

const PAGE = 50

const filters = [
  ['all', 'All'],
  ['unpaid', 'Unpaid'],
  ['overdue', 'Overdue'],
  ['pending', 'Pending delivery'],
  ['cancelled', 'Cancelled'],
]

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

function DeliverDialog({ item, customerName, onClose, onDone }) {
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
    <Modal title={'Deliver ' + item.products.name} onClose={onClose}>
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

function ConfirmDialog({ title, text, confirmLabel, children, onClose, onConfirm }) {
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

function OrderDetail({ orderId, version, onClose, onChanged }) {
  const { profile } = useAuth()
  const isAdmin = profile.role === 'admin'
  const [order, setOrder] = useState(null)
  const [earlierOwed, setEarlierOwed] = useState(0)
  const [missing, setMissing] = useState(false)
  const [delivering, setDelivering] = useState(null)
  const [reversing, setReversing] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [shareNote, setShareNote] = useState('')

  async function load() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, created_at, due_date, notes, cancelled_at, cancel_reason, customer_id, customers(name, phone, location), salesperson:profiles!orders_salesperson_id_fkey(full_name), order_items(id, qty, price, pending_qty, delivered_at, products(name)), payments(id, amount, method, note, paid_at)')
      .eq('id', orderId)
      .maybeSingle()
    if (!data) {
      setMissing(true)
      return
    }
    // What the customer still owes on earlier orders, as of today
    const { data: earlier } = await supabase.from('order_list').select('balance')
      .eq('customer_id', data.customer_id).lt('created_at', data.created_at).is('cancelled_at', null).gt('balance', 0)
    let owed = 0
    for (const row of earlier || []) owed += Number(row.balance)
    setEarlierOwed(owed)
    setOrder(data)
  }

  useEffect(() => { load() }, [orderId, version])
  useEffect(() => { loadPdf() }, [])

  // The parent bumps `version`, which reloads this order too
  function changed() {
    onChanged()
  }

  if (missing) {
    return <Modal title="Order not found" onClose={onClose}><p className="text-sm text-slate-500">This order does not exist.</p></Modal>
  }
  if (!order) return <Modal title="Loading..." onClose={onClose}><div className="h-24" /></Modal>

  const cancelled = !!order.cancelled_at
  let total = 0
  for (const item of order.order_items) total += item.qty * item.price
  let paid = 0
  for (const p of order.payments) paid += Number(p.amount)
  const balance = cancelled ? 0 : Math.max(0, total - paid)
  const overdue = !cancelled && balance > 0.005 && order.due_date && order.due_date < today()

  function invoiceData() {
    return {
      invoiceNumber: invoiceNumber(order.order_number),
      date: order.created_at,
      dueDate: order.due_date,
      customer: order.customers,
      salesperson: order.salesperson?.full_name || '',
      paid,
      previousBalance: earlierOwed,
      notes: order.notes,
      items: order.order_items.map((item) => ({
        name: item.products.name,
        qty: item.qty,
        price: item.price,
        pending_qty: item.pending_qty,
      })),
    }
  }

  async function reversePayment() {
    const { error } = await supabase.rpc('reverse_payment', { p_payment_id: reversing.id })
    if (error) return error.message
    setReversing(null)
    changed()
  }

  async function cancelOrder() {
    const { error } = await supabase.rpc('cancel_order', { p_order_id: order.id, p_reason: cancelReason })
    if (error) return error.message
    setCancelling(false)
    changed()
  }

  return (
    <Modal title={invoiceNumber(order.order_number) + (cancelled ? ' (cancelled)' : '')} onClose={onClose} wide>
      {cancelled && (
        <div className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Cancelled on {new Date(order.cancelled_at).toLocaleDateString()}{order.cancel_reason ? ': ' + order.cancel_reason : ''}.
          Stock was put back and this order no longer counts in sales or debts.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-400">Customer</div>
          <div className="font-semibold">{order.customers?.name}</div>
          <div className="text-slate-500">{order.customers?.phone}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Sold by</div>
          <div className="font-semibold">{order.salesperson?.full_name}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Date</div>
          <div className="font-semibold">{new Date(order.created_at).toLocaleString()}</div>
          {order.due_date && balance > 0.005 && (
            <div className={overdue ? 'font-semibold text-red-600' : 'text-slate-500'}>
              {overdue ? 'Overdue since ' : 'Due '}{new Date(order.due_date).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      {order.notes && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><span className="font-semibold">Note:</span> {order.notes}</div>
      )}

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
                      <button onClick={() => setDelivering(item)}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">
                        Deliver
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
        {!cancelled && (
          <div className="flex justify-between text-base">
            <span className="font-semibold">Balance</span>
            <span className={'font-bold ' + (balance > 0.005 ? 'text-red-600' : 'text-emerald-600')}>
              {balance > 0.005 ? money(balance) : 'Paid in full'}
            </span>
          </div>
        )}
        {!cancelled && earlierOwed > 0.005 && (
          <div className="flex justify-between"><span className="text-slate-500">Still owed on earlier orders</span>
            <span className="font-semibold text-amber-700">{money(earlierOwed)}</span></div>
        )}
      </div>

      {order.payments.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-slate-400">Payments</div>
          <div className="mt-1 divide-y divide-slate-100 text-sm">
            {[...order.payments].sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-600">
                  {new Date(p.paid_at).toLocaleDateString()} · {methodLabel(p.method)}{p.note ? ' · ' + p.note : ''}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{money(p.amount)}</span>
                  {isAdmin && (
                    <button onClick={() => setReversing(p)} className="text-xs font-medium text-red-600 hover:underline">Reverse</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!cancelled && balance > 0.005 && <PaymentForm order={order} balance={balance} onSaved={changed} />}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!cancelled && (
          <>
            <button onClick={() => downloadInvoice(invoiceData())} className="btn-ghost">Download invoice</button>
            <button onClick={async () => setShareNote(shareNotice(await shareInvoice(invoiceData())))} className="btn-ghost">Share</button>
          </>
        )}
        {!cancelled && (
          <button onClick={() => { setCancelReason(''); setCancelling(true) }}
            className="ml-auto text-sm font-medium text-red-600 hover:underline">
            Cancel order
          </button>
        )}
      </div>
      {shareNote && <p className="mt-3 text-sm text-slate-500">{shareNote}</p>}

      {delivering && (
        <DeliverDialog item={delivering} customerName={order.customers?.name}
          onClose={() => setDelivering(null)} onDone={() => { setDelivering(null); changed() }} />
      )}

      {reversing && (
        <ConfirmDialog title="Reverse this payment?" confirmLabel="Yes, reverse"
          text={money(reversing.amount) + ' received on ' + new Date(reversing.paid_at).toLocaleDateString() + ' will be removed and added back to the balance.'}
          onClose={() => setReversing(null)} onConfirm={reversePayment} />
      )}

      {cancelling && (
        <ConfirmDialog title={'Cancel ' + invoiceNumber(order.order_number) + '?'} confirmLabel="Yes, cancel order"
          text={order.payments.length > 0
            ? (isAdmin
              ? 'This order has payments. Reverse them first (Reverse, next to each payment), then cancel.'
              : 'This order has payments, so it cannot be cancelled yet. Ask an admin to reverse the payments first.')
            : 'Items that left the shelf go back into stock and the order stops counting in sales and debts. This cannot be undone.'}
          onClose={() => setCancelling(false)} onConfirm={cancelOrder}>
          <input className="input mt-4" placeholder="Reason (optional)" value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)} />
        </ConfirmDialog>
      )}
    </Modal>
  )
}

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [version, setVersion] = useState(0)
  const selectedId = params.get('order')

  // Wait until typing pauses before searching
  useEffect(() => {
    const t = setTimeout(() => { setQuery(searchTerm(search)); setLimit(PAGE) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let active = true
    setLoading(true)
    let q = supabase.from('order_list').select('*').order('created_at', { ascending: false }).range(0, limit)
    if (query) q = q.or('invoice_number.ilike.%' + query + '%,customer_name.ilike.%' + query + '%,salesperson.ilike.%' + query + '%')
    if (filter === 'unpaid') q = q.is('cancelled_at', null).gt('balance', 0.005)
    if (filter === 'overdue') q = q.eq('overdue', true)
    if (filter === 'pending') q = q.eq('has_pending', true)
    if (filter === 'cancelled') q = q.not('cancelled_at', 'is', null)
    q.then(({ data }) => {
      if (!active) return
      const list = data || []
      setHasMore(list.length > limit)
      setRows(list.slice(0, limit))
      setLoading(false)
    })
    return () => { active = false }
  }, [query, filter, limit, version])

  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1)
    const channel = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function openOrder(id) {
    setParams(id ? { order: id } : {})
  }

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
            <button key={key} onClick={() => { setFilter(key); setLimit(PAGE) }}
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
            {rows.map((order) => {
              const cancelled = !!order.cancelled_at
              const balance = Number(order.balance)
              return (
                <tr key={order.id} onClick={() => openOrder(order.id)}
                  className={'cursor-pointer border-t border-slate-100 hover:bg-slate-50 ' +
                    (cancelled ? 'text-slate-400' : order.has_pending ? 'bg-red-50/50' : '')}>
                  <td className="px-5 py-3 font-medium">
                    <span className={cancelled ? 'line-through' : ''}>{order.invoice_number}</span>
                    {cancelled && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">cancelled</span>}
                    {order.has_pending && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">pending</span>
                    )}
                    {order.overdue && (
                      <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">overdue</span>
                    )}
                  </td>
                  <td className="px-5 py-3">{order.customer_name}</td>
                  <td className="px-5 py-3 text-slate-500">{order.salesperson}</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right font-semibold">{cancelled ? '-' : money(order.total)}</td>
                  <td className={'px-5 py-3 text-right font-semibold ' + (cancelled ? '' : balance > 0.005 ? 'text-red-600' : 'text-emerald-600')}>
                    {cancelled ? '-' : balance > 0.005 ? money(balance) : 'Paid'}
                  </td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-400">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button disabled={loading} onClick={() => setLimit(limit + PAGE)} className="btn-ghost">
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {selectedId && (
        <OrderDetail orderId={selectedId} version={version} onClose={() => openOrder(null)}
          onChanged={() => setVersion((v) => v + 1)} />
      )}
    </div>
  )
}
