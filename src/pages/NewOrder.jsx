import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from '../components/Modal'
import { money, stockStatus } from '../format'
import { downloadInvoice } from '../invoice'

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

function CustomerStep({ customers, onPick }) {
  const [mode, setMode] = useState('existing')
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', location: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function continueWithNew(e) {
    e.preventDefault()
    setSaving(true)
    const { data, error } = await supabase.from('customers').insert({
      name: form.name,
      phone: form.phone || null,
      location: form.location || null,
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
        <div className="space-y-4">
          <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.location ? ' (' + c.location + ')' : ''}</option>
            ))}
          </select>
          <button disabled={!selectedId} className="btn"
            onClick={() => onPick(customers.find((c) => c.id === selectedId))}>
            Continue
          </button>
        </div>
      ) : (
        <form onSubmit={continueWithNew} className="space-y-4">
          <input className="input" placeholder="Customer or lab name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" placeholder="Phone" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Location" value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })} />
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button disabled={saving} className="btn">Save and continue</button>
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
    if (!(qty > 0) || !(price > 0)) allReady = false
    if (short && !line.ok) allReady = false
    total += qty * price
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {lines.map((line) => {
          const qty = Number(line.qty)
          const stock = line.product.stock_qty
          const short = qty > stock
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
                  <input className="input" type="number" min="1" value={line.qty}
                    onChange={(e) => onChange(line.product.id, { qty: e.target.value, ok: false })} />
                </div>
                <div className="w-32 sm:w-36">
                  <label className="text-xs text-slate-500">Price (GH₵)</label>
                  <input className="input" type="number" min="0" step="0.01" value={line.price}
                    onChange={(e) => onChange(line.product.id, { price: e.target.value })} />
                </div>
                <div className="ml-auto text-right sm:w-32">
                  <div className="text-xs text-slate-500">Amount</div>
                  <div className="font-bold">{money(qty * Number(line.price))}</div>
                </div>
                <button onClick={() => onRemove(line.product.id)} className="text-slate-300 hover:text-red-500">✕</button>
              </div>

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

export default function NewOrder() {
  const { profile } = useAuth()
  const [step, setStep] = useState(1)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customer, setCustomer] = useState(null)
  const [lines, setLines] = useState([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  async function loadData() {
    const [c, p] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ])
    setCustomers(c.data || [])
    setProducts(p.data || [])
  }

  useEffect(() => { loadData() }, [])

  function toggleProduct(product) {
    const exists = lines.find((l) => l.product.id === product.id)
    if (exists) setLines(lines.filter((l) => l.product.id !== product.id))
    else setLines([...lines, { product, qty: '', price: '', ok: false }])
  }

  function updateLine(id, changes) {
    setLines(lines.map((l) => (l.product.id === id ? { ...l, ...changes } : l)))
  }

  function removeLine(id) {
    const rest = lines.filter((l) => l.product.id !== id)
    setLines(rest)
    if (rest.length === 0) setStep(2)
  }

  function invoiceItems() {
    return lines.map((l) => ({
      name: l.product.name,
      qty: Number(l.qty),
      price: Number(l.price),
      pending_qty: Math.max(0, Number(l.qty) - l.product.stock_qty),
    }))
  }

  async function submit() {
    setSaving(true)
    setError('')

    const items = lines.map((l) => ({ product_id: l.product.id, qty: Number(l.qty), price: Number(l.price) }))
    const { data: orderId, error } = await supabase.rpc('create_order', { p_customer_id: customer.id, p_items: items })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    const { data: order } = await supabase.from('orders').select('order_number, created_at').eq('id', orderId).single()
    const invoice = {
      orderNumber: order.order_number,
      date: order.created_at,
      customer,
      salesperson: profile.full_name,
      items: invoiceItems(),
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
    loadData()
  }

  if (done) {
    let total = 0
    for (const item of done.items) total += item.qty * item.price
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
        <h1 className="mt-5 text-xl font-bold">Order #{done.orderNumber} created</h1>
        <p className="mt-1 text-sm text-slate-500">{done.customer.name} · {money(total)}</p>
        <p className="mt-1 text-sm text-slate-400">The invoice was downloaded and the admin has been notified.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={() => downloadInvoice(done)} className="btn">Download invoice again</button>
          <button onClick={reset} className="btn-ghost">New order</button>
          <Link to="/orders" className="btn-ghost">View orders</Link>
        </div>
      </div>
    )
  }

  let total = 0
  for (const l of lines) total += Number(l.qty) * Number(l.price)
  const owed = lines.filter((l) => Number(l.qty) > l.product.stock_qty)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">New order</h1>
          {customer && <p className="text-sm text-slate-500">For {customer.name}</p>}
        </div>
        <StepBar step={step} />
      </div>

      {step === 1 && <CustomerStep customers={customers} onPick={(c) => { setCustomer(c); setStep(2) }} />}

      {step === 2 && (
        <ItemsStep products={products} selectedIds={lines.map((l) => l.product.id)}
          onToggle={toggleProduct} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}

      {step === 3 && (
        <ReviewStep lines={lines} onChange={updateLine} onRemove={removeLine}
          onBack={() => setStep(2)} onCheckout={() => setConfirmOpen(true)} />
      )}

      {confirmOpen && (
        <Modal title="Confirm order" onClose={() => setConfirmOpen(false)} wide>
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

          {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setConfirmOpen(false)} className="btn-ghost">Go back</button>
            <button disabled={saving} onClick={submit} className="btn">
              {saving ? 'Creating...' : 'Confirm and create invoice'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
