import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from '../components/Modal'
import LoadError from '../components/LoadError'
import ReceiptActions from '../components/ReceiptActions'
import { money, stockStatus, paymentMethods, today } from '../format'
import { downloadInvoice, shareInvoice, shareNotice, invoiceNumber, invoiceTotals, loadPdf } from '../invoice'

function StepBar({ step }) {
  const names = ['Customer', 'Items', 'Review']
  return (
    <div className="flex items-center gap-3">
      {names.map((name, i) => (
        <div key={name} className="flex items-center gap-3">
          <div className={'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ' +
            (step >= i + 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500')}>
            {i + 1}
          </div>
          <span className={'hidden text-sm font-medium sm:inline ' + (step >= i + 1 ? 'text-slate-800' : 'text-slate-400')}>{name}</span>
          {i < 2 && <div className="h-px w-6 bg-slate-300 sm:w-10" />}
        </div>
      ))}
    </div>
  )
}

function validQty(value) {
  const qty = Number(value)
  return Number.isInteger(qty) && qty >= 1
}

function digits(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-9)
}

function CustomerStep({ customers, owedBy, onPick }) {
  const [mode, setMode] = useState('existing')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', location: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dupeOk, setDupeOk] = useState(false)

  const term = search.trim().toLowerCase()
  const matches = customers.filter((c) =>
    (c.name + ' ' + (c.location || '') + ' ' + (c.phone || '')).toLowerCase().includes(term)).slice(0, 30)

  // Customers that look like the one being added
  const newName = form.name.trim().toLowerCase()
  const newPhone = digits(form.phone)
  const dupes = customers.filter((c) =>
    (newName.length >= 3 && c.name.trim().toLowerCase() === newName) ||
    (newPhone.length >= 9 && digits(c.phone) === newPhone))

  async function continueWithNew(e) {
    e.preventDefault()
    if (dupes.length > 0 && !dupeOk) return
    setSaving(true)
    const { data, error } = await supabase.from('customers').insert({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      location: form.location.trim() || null,
    }).select().single()
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onPick(data)
  }

  return (
    <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex gap-2 rounded-lg bg-slate-100 p-1">
        {[['existing', 'Existing customer'], ['new', 'New customer']].map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)}
            className={'flex-1 rounded-md py-1.5 text-sm font-medium ' +
              (mode === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'existing' ? (
        <div className="space-y-3">
          <input className="input" placeholder="Search by name, phone or location" value={search} autoFocus
            onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {matches.map((c) => (
              <button key={c.id} onClick={() => onPick(c)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="truncate text-xs text-slate-400">{[c.phone, c.location].filter(Boolean).join(' · ')}</div>
                </div>
                {owedBy[c.id] > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    owes {money(owedBy[c.id])}
                  </span>
                )}
              </button>
            ))}
            {matches.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                No customer found. <button onClick={() => { setMode('new'); setForm({ ...form, name: search }) }}
                  className="font-medium text-indigo-600 hover:underline">Add a new one</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={continueWithNew} className="space-y-4">
          <input className="input" placeholder="Customer or lab name" value={form.name}
            onChange={(e) => { setForm({ ...form, name: e.target.value }); setDupeOk(false) }} required />
          <input className="input" placeholder="Phone" value={form.phone}
            onChange={(e) => { setForm({ ...form, phone: e.target.value }); setDupeOk(false) }} />
          <input className="input" placeholder="Location" value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })} />

          {dupes.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-medium">This customer may already exist:</div>
              <div className="mt-2 space-y-1">
                {dupes.slice(0, 3).map((c) => (
                  <button type="button" key={c.id} onClick={() => onPick(c)}
                    className="block w-full rounded-md bg-white px-3 py-2 text-left hover:bg-amber-100">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-amber-700"> {[c.phone, c.location].filter(Boolean).join(' · ')}</span>
                    <span className="float-right text-xs font-semibold text-indigo-600">Use this</span>
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" checked={dupeOk} onChange={(e) => setDupeOk(e.target.checked)} />
                No, this is a different customer
              </label>
            </div>
          )}

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button disabled={saving || (dupes.length > 0 && !dupeOk)} className="btn">Save and continue</button>
        </form>
      )}
    </div>
  )
}

function ItemsStep({ products, selectedIds, onToggle, onBack, onNext }) {
  const [search, setSearch] = useState('')
  const shown = products.filter((p) => (p.name + ' ' + (p.brand || '')).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input className="input md:max-w-sm" placeholder="Search products" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-3">
          <button onClick={onBack} className="btn-ghost">Back</button>
          <button disabled={selectedIds.length === 0} onClick={onNext} className="btn">
            Review {selectedIds.length} item{selectedIds.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 xl:grid-cols-5">
        {shown.map((p) => {
          const selected = selectedIds.includes(p.id)
          const status = stockStatus(p)
          return (
            <button key={p.id} onClick={() => onToggle(p)}
              className={'overflow-hidden rounded-2xl border-2 bg-white text-left transition ' +
                (selected ? 'border-indigo-600 shadow-md' : 'border-slate-200 hover:border-slate-300')}>
              <div className="relative flex h-32 items-center justify-center bg-white p-3">
                {p.image_url ? <img src={p.image_url} className="h-full w-full object-contain" /> : <span className="text-3xl text-slate-200">▢</span>}
                {selected && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">✓</span>
                )}
              </div>
              <div className="border-t border-slate-100 p-3">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <span className={'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ' + status.cls}>
                  {p.stock_qty === 0 ? 'Out of stock' : p.stock_qty + ' left'}
                </span>
                {p.owed_qty > 0 && (
                  <span className="ml-1 mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    {p.owed_qty} owed
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ReviewStep({ lines, onChange, onRemove, onBack, onCheckout }) {
  let allReady = lines.length > 0
  let total = 0

  for (const line of lines) {
    const qty = Number(line.qty)
    const price = Number(line.price)
    const short = qty > line.product.stock_qty
    if (!validQty(line.qty) || !(price > 0)) allReady = false
    if (short && !line.ok) allReady = false
    total += qty * price
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {lines.map((line) => {
          const qty = Number(line.qty)
          const stock = line.product.stock_qty
          const qtyOk = validQty(line.qty)
          const short = qtyOk && qty > stock
          return (
            <div key={line.product.id}
              className={'rounded-2xl border bg-white p-4 shadow-sm ' +
                (short && line.ok ? 'border-red-300 bg-red-50/40' : 'border-slate-200')}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white">
                  {line.product.image_url ? <img src={line.product.image_url} className="h-full w-full object-contain p-1" /> : <span className="text-slate-200">▢</span>}
                </div>
                <div className="min-w-[8rem] flex-1">
                  <div className="truncate font-semibold">{line.product.name}</div>
                  <div className="text-xs text-slate-400">{stock} in stock</div>
                </div>
                <div className="w-24 sm:w-28">
                  <label className="text-xs text-slate-500">Quantity</label>
                  <input className={'input ' + (qtyOk ? '' : '!border-red-400')} type="number" min="1" step="1" value={line.qty}
                    onChange={(e) => onChange(line.product.id, { qty: e.target.value, ok: false })} />
                </div>
                <div className="w-32 sm:w-36">
                  <label className="text-xs text-slate-500">Price (GH₵)</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={line.price}
                    onChange={(e) => onChange(line.product.id, { price: e.target.value })} />
                  {line.priceHint && line.price === line.priceHint.value && (
                    <div className="mt-0.5 text-[11px] text-slate-400">{line.priceHint.label}</div>
                  )}
                </div>
                <div className="ml-auto text-right sm:w-32">
                  <div className="text-xs text-slate-500">Amount</div>
                  <div className="font-bold">{money(qtyOk ? qty * Number(line.price) : 0)}</div>
                </div>
                <button onClick={() => onRemove(line.product.id)} className="text-slate-300 hover:text-red-500">✕</button>
              </div>

              {line.product.owed_qty > 0 && stock > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
                  {line.product.owed_qty} of this product {line.product.owed_qty === 1 ? 'is' : 'are'} owed to earlier customers.
                  Selling now uses stock they are waiting for.
                </div>
              )}

              {!qtyOk && line.qty !== '' && (
                <div className="mt-2 text-sm text-red-600">Quantity must be a whole number of at least 1.</div>
              )}

              {short && !line.ok && (
                <div className="mt-3 flex flex-col gap-3 rounded-xl bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-red-700">
                    Only {stock} in stock. Add anyway? {qty - stock} will be marked as owed to the customer.
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onChange(line.product.id, { ok: true })}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                      Add anyway
                    </button>
                    <button onClick={() => onRemove(line.product.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {short && line.ok && (
                <div className="mt-3 text-sm font-medium text-red-600">
                  {qty - stock} to be delivered later
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-4 card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-500">Order total</div>
          <div className="text-2xl font-bold">{money(total)}</div>
        </div>
        <div className="flex gap-3">
          <button onClick={onBack} className="btn-ghost">Back to items</button>
          <button disabled={!allReady} onClick={onCheckout} className="btn">Proceed to checkout</button>
        </div>
      </div>
    </div>
  )
}

function CheckoutModal({ customer, previousBalance, lines, total, saving, error, onClose, onSubmit }) {
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState('cash')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  const paidNum = Math.round(Number(paid || 0) * 100) / 100
  const maxPaid = total + previousBalance
  const paidOk = paidNum >= 0 && paidNum <= maxPaid + 0.001
  // Money goes to this order first; anything above clears earlier debt
  const onOrder = Math.min(paidNum, total)
  const towardOld = Math.max(0, paidNum - total)
  const balance = Math.max(0, total - onOrder)
  const prevAfter = Math.max(0, previousBalance - towardOld)
  const owed = lines.filter((l) => Number(l.qty) > l.product.stock_qty)

  return (
    <Modal title="Confirm order" onClose={onClose} wide>
      <div className="text-sm text-slate-500">Customer</div>
      <div className="font-semibold">{customer.name}</div>

      <div className="overflow-x-auto"><table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr><th className="py-2">Item</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const short = Number(l.qty) > l.product.stock_qty
            return (
              <tr key={l.product.id} className={'border-t border-slate-100 ' + (short ? 'bg-red-50 text-red-700' : '')}>
                <td className="py-2">{l.product.name}{short && <span className="ml-2 text-xs">({Number(l.qty) - l.product.stock_qty} owed)</span>}</td>
                <td className="py-2 text-center">{l.qty}</td>
                <td className="py-2 text-right">{money(l.price)}</td>
                <td className="py-2 text-right font-semibold">{money(Number(l.qty) * Number(l.price))}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
        <span className="text-sm text-slate-500">{owed.length > 0 ? owed.length + ' item(s) will be delivered later' : 'All items in stock'}</span>
        <span className="text-xl font-bold">{money(total)}</span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Amount paid now (GH₵)</label>
            <span className="flex gap-2">
              <button type="button" onClick={() => setPaid(total.toFixed(2))} className="text-xs font-medium text-indigo-600 hover:underline">
                This order
              </button>
              {previousBalance > 0 && (
                <button type="button" onClick={() => setPaid(maxPaid.toFixed(2))} className="text-xs font-medium text-indigo-600 hover:underline">
                  + old debt
                </button>
              )}
            </span>
          </div>
          <input className={'input ' + (paidOk ? '' : '!border-red-400')} type="number" min="0" step="0.01" max={maxPaid}
            placeholder="0.00" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Payment method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} disabled={paidNum <= 0}>
            {paymentMethods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Due date for balance</label>
          <input className="input" type="date" min={today()} value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            disabled={balance <= 0.005} />
        </div>
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Balance on this order</span>
          <span className={'font-semibold ' + (balance > 0.005 ? 'text-red-600' : 'text-emerald-600')}>{money(balance)}</span></div>
        {previousBalance > 0 && (
          <div className="flex justify-between"><span className="text-slate-500">Owed from earlier orders</span>
            <span className="font-semibold text-amber-700">{money(previousBalance)}</span></div>
        )}
        {towardOld > 0 && (
          <div className="flex justify-between"><span className="text-slate-500">Paid toward earlier orders now</span>
            <span className="font-semibold text-emerald-600">- {money(towardOld)}</span></div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-semibold">Total due after this order</span>
          <span className="font-bold">{money(balance + prevAfter)}</span></div>
      </div>

      <textarea className="input mt-4" rows="2" placeholder="Note for this order (optional, printed on the invoice)"
        value={notes} onChange={(e) => setNotes(e.target.value)} />

      {!paidOk && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Amount paid can be at most {money(maxPaid)} (this order plus what they owe).</div>}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Go back</button>
        <button disabled={saving || !paidOk}
          onClick={() => onSubmit({ paid: paidNum, method, dueDate: balance > 0.005 && dueDate ? dueDate : null, notes: notes.trim() || null })}
          className="btn">
          {saving ? 'Creating...' : 'Confirm and create invoice'}
        </button>
      </div>
    </Modal>
  )
}

export default function NewOrder() {
  const { profile } = useAuth()
  const [step, setStep] = useState(1)
  const [customers, setCustomers] = useState([])
  const [owedBy, setOwedBy] = useState({})
  const [products, setProducts] = useState([])
  const [customer, setCustomer] = useState(null)
  const [lines, setLines] = useState([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [lastPrices, setLastPrices] = useState({})
  const [loadFailed, setLoadFailed] = useState(false)
  const [shareNote, setShareNote] = useState('')

  async function loadData() {
    setLoadFailed(false)
    const [c, p, b, o] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('customer_balances').select('customer_id, owed').gt('owed', 0),
      supabase.from('product_owed').select('product_id, owed_qty'),
    ])
    if (c.error || p.error || b.error) {
      setLoadFailed(true)
      return
    }
    setCustomers(c.data || [])
    const owedQty = {}
    for (const row of o.data || []) owedQty[row.product_id] = row.owed_qty
    setProducts((p.data || []).map((prod) => ({ ...prod, owed_qty: owedQty[prod.id] || 0 })))
    const owed = {}
    for (const row of b.data || []) owed[row.customer_id] = Number(row.owed)
    setOwedBy(owed)
  }

  useEffect(() => { loadData(); loadPdf() }, [])

  // Last price used for each product, preferring this customer's last price
  useEffect(() => {
    if (!customer) return
    supabase.rpc('last_prices', { p_customer_id: customer.id }).then(({ data }) => {
      const prices = {}
      for (const row of data || []) prices[row.product_id] = row
      setLastPrices(prices)
    })
  }, [customer])

  function toggleProduct(product) {
    const exists = lines.find((l) => l.product.id === product.id)
    if (exists) setLines(lines.filter((l) => l.product.id !== product.id))
    else {
      const last = lastPrices[product.id]
      const value = last ? String(Number(last.price)) : ''
      const priceHint = last ? { value, label: last.for_customer ? "This customer's last price" : 'Last price used' } : null
      setLines([...lines, { product, qty: '1', price: value, priceHint, ok: false }])
    }
  }

  function updateLine(id, changes) {
    setLines(lines.map((l) => (l.product.id === id ? { ...l, ...changes } : l)))
  }

  function removeLine(id) {
    const rest = lines.filter((l) => l.product.id !== id)
    setLines(rest)
    if (rest.length === 0) setStep(2)
  }

  async function submit({ paid, method, dueDate, notes }) {
    setSaving(true)
    setError('')

    const items = lines.map((l) => ({ product_id: l.product.id, qty: Number(l.qty), price: Number(l.price) }))
    const { data: orderId, error } = await supabase.rpc('create_order', {
      p_customer_id: customer.id,
      p_items: items,
      p_amount_paid: paid,
      p_method: method,
      p_due_date: dueDate,
      p_notes: notes,
    })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    // Build the invoice from what was actually saved (stock may have changed since this page loaded)
    const { data: order } = await supabase.from('orders')
      .select('order_number, created_at, previous_balance, due_date, notes, order_items(qty, price, pending_qty, product_name, products(name)), payments(receipt_id)')
      .eq('id', orderId).single()
    let saved = 0
    for (const item of order.order_items) saved += item.qty * Number(item.price)
    const invoice = {
      receiptId: order.payments[0]?.receipt_id || null,
      paidTowardOld: Math.max(0, paid - saved),
      invoiceNumber: invoiceNumber(order.order_number),
      date: order.created_at,
      dueDate: order.due_date,
      customer,
      salesperson: profile.full_name,
      paid: Math.min(paid, saved),
      previousBalance: Number(order.previous_balance),
      notes: order.notes,
      items: order.order_items.map((item) => ({
        name: item.product_name || item.products.name,
        qty: item.qty,
        price: Number(item.price),
        pending_qty: item.pending_qty,
      })),
    }
    downloadInvoice(invoice)
    setDone(invoice)
    setConfirmOpen(false)
    setSaving(false)
  }

  function reset() {
    setStep(1)
    setCustomer(null)
    setLines([])
    setDone(null)
    setShareNote('')
    loadData()
  }

  if (done) {
    const t = invoiceTotals(done)
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
        <h1 className="mt-5 text-xl font-bold">Invoice {done.invoiceNumber} created</h1>
        <p className="mt-1 text-sm text-slate-500">{done.customer.name} · {money(t.subtotal)} · paid {money(t.paid)}</p>
        {done.paidTowardOld > 0 && (
          <p className="mt-1 text-sm text-emerald-700">Plus {money(done.paidTowardOld)} paid toward earlier orders</p>
        )}
        {t.totalDue > 0.005 && (
          <p className="mt-1 text-sm font-medium text-red-600">Customer now owes {money(t.totalDue)}</p>
        )}
        <p className="mt-1 text-sm text-slate-400">
          The invoice was downloaded{profile.role === 'admin' ? '.' : ' and the admins have been notified.'}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={() => downloadInvoice(done)} className="btn">Download again</button>
          <button onClick={async () => setShareNote(shareNotice(await shareInvoice(done)))} className="btn-ghost">Share</button>
          <button onClick={reset} className="btn-ghost">New order</button>
          <Link to="/orders" className="btn-ghost">View orders</Link>
        </div>
        {shareNote && <p className="mt-4 text-sm text-slate-500">{shareNote}</p>}
        {done.receiptId && (
          <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div className="font-medium">Receipt for the {money(t.paid + done.paidTowardOld)} received</div>
            <ReceiptActions receiptId={done.receiptId} className="mt-1 block" />
          </div>
        )}
      </div>
    )
  }

  let total = 0
  for (const l of lines) total += Number(l.qty) * Number(l.price)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">New order</h1>
          {customer && (
            <p className="text-sm text-slate-500">
              For {customer.name}
              {owedBy[customer.id] > 0 && <span className="text-amber-700"> · owes {money(owedBy[customer.id])}</span>}
            </p>
          )}
        </div>
        <StepBar step={step} />
      </div>

      {loadFailed && <LoadError onRetry={loadData} />}

      {step === 1 && <CustomerStep customers={customers} owedBy={owedBy} onPick={(c) => { setCustomer(c); setStep(2) }} />}

      {step === 2 && (
        <ItemsStep products={products} selectedIds={lines.map((l) => l.product.id)}
          onToggle={toggleProduct} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}

      {step === 3 && (
        <ReviewStep lines={lines} onChange={updateLine} onRemove={removeLine}
          onBack={() => setStep(2)} onCheckout={() => { setError(''); setConfirmOpen(true) }} />
      )}

      {confirmOpen && (
        <CheckoutModal customer={customer} previousBalance={owedBy[customer.id] || 0} lines={lines} total={total}
          saving={saving} error={error} onClose={() => setConfirmOpen(false)} onSubmit={submit} />
      )}
    </div>
  )
}
