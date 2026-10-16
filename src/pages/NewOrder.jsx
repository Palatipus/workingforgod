import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, selectAll } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from '../components/Modal'
import { company } from '../company'
import LoadError from '../components/LoadError'
import ReceiptActions from '../components/ReceiptActions'
import { money, stockStatus, paymentMethods, today } from '../format'
import { downloadInvoice, shareInvoice, shareNotice, invoiceNumber, invoiceTotals, loadPdf } from '../invoice'
import { errorText } from '../errors'

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

// Prices are money: round to 2 decimals so the app and the database always agree on totals
function price2(value) {
  return Math.round(Number(value) * 100) / 100
}

function validQty(value) {
  const qty = Number(value)
  return Number.isInteger(qty) && qty >= 1
}

// A line is a product, or an extra charge (service fee, delivery, ...) with its own description
function lineName(line) {
  return line.product ? line.product.name : line.name
}

let extraCount = 0
function extraKey() {
  extraCount += 1
  return 'extra-' + Date.now().toString(36) + '-' + extraCount
}

function lineState(line) {
  const qtyOk = validQty(line.qty)
  const priceBlank = String(line.price ?? '').trim() === ''
  const priceOk = !priceBlank && price2(line.price) > 0
  const nameOk = !!line.product || String(line.name || '').trim() !== ''
  const short = !!line.product && qtyOk && Number(line.qty) > line.product.stock_qty
  return { qtyOk, priceBlank, priceOk, nameOk, short }
}

// Lines as the database expects them
function orderLines(lines) {
  return lines.map((l) => ({
    product_id: l.product ? l.product.id : null,
    name: l.product ? null : l.name.trim(),
    qty: Number(l.qty),
    price: String(l.price ?? '').trim() === '' ? null : price2(l.price),
  }))
}

function digits(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-9)
}

function CustomerStep({ customers, owedBy, creditBy, onPick }) {
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
      setError(errorText(error))
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
                {creditBy[c.id] > 0 && (
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {money(creditBy[c.id])} credit
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

function ItemsStep({ products, selectedIds, count, onToggle, onAddExtra, onBack, onNext }) {
  const [search, setSearch] = useState('')
  const shown = products.filter((p) => (p.name + ' ' + (p.brand || '')).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input className="input md:max-w-sm" placeholder="Search products" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-3">
          <button onClick={onBack} className="btn-ghost">Back</button>
          {count === 0 && <button onClick={onAddExtra} className="btn-ghost">Service only (no products)</button>}
          <button disabled={count === 0} onClick={onNext} className="btn">
            Review {count} item{count === 1 ? '' : 's'}
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

function QtyPriceAmount({ line, onChange, onRemove }) {
  const { qtyOk, priceBlank } = lineState(line)
  const qty = Number(line.qty)
  return (
    <>
      <div className="w-24 sm:w-28">
        <label className="text-xs text-slate-500">Quantity</label>
        <input className={'input ' + (qtyOk ? '' : '!border-red-400')} type="number" min="1" step="1" value={line.qty}
          onChange={(e) => onChange(line.key, { qty: e.target.value, ok: false })} />
      </div>
      <div className="w-32 sm:w-36">
        <label className="text-xs text-slate-500">Price (GH₵)</label>
        <input className={'input ' + (priceBlank ? '!border-amber-400 !bg-amber-50/50' : '')} type="number" min="0.01" step="0.01"
          placeholder="Not known yet" value={line.price}
          onChange={(e) => onChange(line.key, { price: e.target.value })}
          onBlur={(e) => e.target.value !== '' && onChange(line.key, { price: String(price2(e.target.value)) })} />
        {line.priceHint && line.price === line.priceHint.value && (
          <div className="mt-0.5 text-[11px] text-slate-400">{line.priceHint.label}</div>
        )}
      </div>
      <div className="ml-auto text-right sm:w-32">
        <div className="text-xs text-slate-500">Amount</div>
        <div className="font-bold">{priceBlank ? <span className="text-amber-700">Price needed</span> : money(qtyOk ? qty * price2(line.price) : 0)}</div>
      </div>
      <button onClick={() => onRemove(line.key)} aria-label="Remove" className="text-slate-300 hover:text-red-500">✕</button>
    </>
  )
}

function ExtraLine({ line, onChange, onRemove }) {
  const { qtyOk, nameOk } = lineState(line)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xl text-slate-300">+</div>
        <div className="min-w-[10rem] flex-1">
          <label className="text-xs text-slate-500">Extra charge</label>
          <input className={'input ' + (nameOk ? '' : '!border-red-400')} placeholder="e.g. Service fee, Delivery, Installation"
            value={line.name} onChange={(e) => onChange(line.key, { name: e.target.value })} />
        </div>
        <QtyPriceAmount line={line} onChange={onChange} onRemove={onRemove} />
      </div>
      {!qtyOk && line.qty !== '' && (
        <div className="mt-2 text-sm text-red-600">Quantity must be a whole number of at least 1.</div>
      )}
      {!nameOk && <div className="mt-2 text-sm text-red-600">Describe what this charge is for. It is printed on the invoice.</div>}
    </div>
  )
}

function ReviewStep({ lines, isPending, onChange, onRemove, onAddExtra, onBack, onCheckout, onSavePending }) {
  let canSave = lines.length > 0
  let missing = 0
  let total = 0

  for (const line of lines) {
    const s = lineState(line)
    if (!s.qtyOk || !s.nameOk || (!s.priceBlank && !s.priceOk)) canSave = false
    if (s.short && !line.ok) canSave = false
    if (s.priceBlank) missing += 1
    else if (s.qtyOk) total += Number(line.qty) * price2(line.price)
  }
  const canCheckout = canSave && missing === 0

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {lines.map((line) => {
          if (!line.product) return <ExtraLine key={line.key} line={line} onChange={onChange} onRemove={onRemove} />
          const qty = Number(line.qty)
          const stock = line.product.stock_qty
          const { qtyOk, short } = lineState(line)
          return (
            <div key={line.key}
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
                <QtyPriceAmount line={line} onChange={onChange} onRemove={onRemove} />
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
                    <button onClick={() => onChange(line.key, { ok: true })}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                      Add anyway
                    </button>
                    <button onClick={() => onRemove(line.key)}
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

      <button onClick={onAddExtra}
        className="w-full rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-3 text-sm font-medium text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/40">
        + Add extra charge (service fee, delivery, installation...)
      </button>

      <div className="card space-y-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-slate-500">Order total</div>
            <div className="text-2xl font-bold">{money(total)}</div>
            {missing > 0 && (
              <div className="text-sm font-medium text-amber-700">
                + {missing} item{missing === 1 ? '' : 's'} without a price yet
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={onBack} className="btn-ghost">Back to items</button>
            <button disabled={!canSave} onClick={onSavePending} className="btn-ghost">
              {isPending ? 'Save changes, finish later' : 'Save as pending'}
            </button>
            <button disabled={!canCheckout} onClick={onCheckout} className="btn">
              {isPending ? 'Finish order' : 'Proceed to checkout'}
            </button>
          </div>
        </div>
        {missing > 0 && canSave && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Don't know a price yet? <b>Save as pending</b>. The items are held for this customer, and you or an admin
            can add the prices and finish the order later from the Orders page.
          </div>
        )}
      </div>
    </div>
  )
}

function SavePendingModal({ customer, lines, note, saving, error, onClose, onSubmit }) {
  const [text, setText] = useState(note || '')
  const missing = lines.filter((l) => lineState(l).priceBlank).length
  const products = lines.filter((l) => l.product)
  return (
    <Modal title="Save as pending" onClose={onClose}>
      <p className="text-sm text-slate-600">
        The order for <b>{customer.name}</b> is saved but not finished: no invoice yet, and the customer owes nothing yet.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {missing > 0 && <li>{missing} price{missing === 1 ? ' is' : 's are'} still needed.</li>}
        {products.length > 0 && <li>The products are taken out of stock and held for this customer until the order is finished or deleted.</li>}
        <li>Admins are notified, so the boss can fill in the prices too.</li>
      </ul>
      <textarea className="input mt-4" rows="2" placeholder="Note for whoever finishes it (optional, not printed)"
        value={text} onChange={(e) => setText(e.target.value)} />
      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Go back</button>
        <button disabled={saving} onClick={() => onSubmit(text.trim() || null)} className="btn">
          {saving ? 'Saving...' : 'Save as pending'}
        </button>
      </div>
    </Modal>
  )
}

function CheckoutModal({ customer, previousBalance, credit, lines, total, saving, error, onClose, onSubmit }) {
  const [paid, setPaid] = useState('')
  const [useCredit, setUseCredit] = useState(credit > 0)
  const [method, setMethod] = useState('cash')
  // Start from the business's usual credit terms (Settings), if any
  const [dueDate, setDueDate] = useState(() => {
    const days = Number(company.defaultDueDays)
    if (!(days > 0)) return ''
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  })
  const [notes, setNotes] = useState('')

  const paidNum = Math.round(Number(paid || 0) * 100) / 100
  const paidOk = paidNum >= 0
  // The customer's credit pays this order first, then money paid now; anything above clears earlier debt,
  // and whatever is left after that is kept as credit
  const fromCredit = useCredit ? Math.min(credit, total) : 0
  const toPay = Math.max(0, total - fromCredit)
  const onOrder = Math.min(paidNum, toPay)
  const towardOld = Math.min(Math.max(0, paidNum - toPay), previousBalance)
  const keptAsCredit = Math.max(0, paidNum - onOrder - towardOld)
  const balance = Math.max(0, toPay - onOrder)
  const prevAfter = Math.max(0, previousBalance - towardOld)
  const maxPaid = toPay + previousBalance
  const owed = lines.filter((l) => lineState(l).short)

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
            const short = lineState(l).short
            return (
              <tr key={l.key} className={'border-t border-slate-100 ' + (short ? 'bg-red-50 text-red-700' : '')}>
                <td className="py-2">{lineName(l)}{short && <span className="ml-2 text-xs">({Number(l.qty) - l.product.stock_qty} owed)</span>}</td>
                <td className="py-2 text-center">{l.qty}</td>
                <td className="py-2 text-right">{money(l.price)}</td>
                <td className="py-2 text-right font-semibold">{money(Number(l.qty) * price2(l.price))}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
        <span className="text-sm text-slate-500">{owed.length > 0 ? owed.length + ' item(s) will be delivered later' : 'All items in stock'}</span>
        <span className="text-xl font-bold">{money(total)}</span>
      </div>

      {credit > 0 && (
        <label className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <span className="flex items-center gap-2">
            <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />
            Use their credit ({money(credit)} available)
          </span>
          {useCredit && <span className="font-semibold">- {money(fromCredit)}</span>}
        </label>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Amount paid now (GH₵)</label>
            <span className="flex gap-2">
              <button type="button" onClick={() => setPaid(toPay.toFixed(2))} className="text-xs font-medium text-indigo-600 hover:underline">
                This order
              </button>
              {previousBalance > 0 && (
                <button type="button" onClick={() => setPaid(maxPaid.toFixed(2))} className="text-xs font-medium text-indigo-600 hover:underline">
                  + old debt
                </button>
              )}
            </span>
          </div>
          <input className={'input ' + (paidOk ? '' : '!border-red-400')} type="number" min="0" step="0.01"
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
        {keptAsCredit > 0 && (
          <div className="flex justify-between"><span className="text-slate-500">Extra kept as credit for future orders</span>
            <span className="font-semibold text-indigo-700">{money(keptAsCredit)}</span></div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-semibold">Total due after this order</span>
          <span className="font-bold">{money(balance + prevAfter)}</span></div>
      </div>

      <textarea className="input mt-4" rows="2" placeholder="Note for this order (optional, printed on the invoice)"
        value={notes} onChange={(e) => setNotes(e.target.value)} />

      {!paidOk && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Amount paid cannot be negative.</div>}
      {keptAsCredit > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {money(paidNum)} is more than this order and what they owe. Check the amount; the extra {money(keptAsCredit)} will be kept as credit.
        </div>
      )}
      {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost">Go back</button>
        <button disabled={saving || !paidOk}
          onClick={() => onSubmit({ paid: paidNum, method, dueDate: balance > 0.005 && dueDate ? dueDate : null, notes: notes.trim() || null, useCredit: useCredit && credit > 0 })}
          className="btn">
          {saving ? 'Creating...' : 'Confirm and create invoice'}
        </button>
      </div>
    </Modal>
  )
}

// An unfinished order is kept on this device, so a phone call or closed tab doesn't lose it
function draftKey(userId) {
  return 'wfg-order-draft-' + userId
}

function readDraft(userId) {
  try { return JSON.parse(localStorage.getItem(draftKey(userId)) || 'null') } catch { return null }
}

function clearDraft(userId) {
  try { localStorage.removeItem(draftKey(userId)) } catch { /* storage blocked */ }
}

// Opening a pending order (or leaving one) starts the page fresh
export default function NewOrderPage() {
  const [params] = useSearchParams()
  return <NewOrder key={params.get('pending') || 'new'} />
}

function NewOrder() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const pendingId = params.get('pending')
  const started = useRef(false)
  const [restoredAt, setRestoredAt] = useState(null)
  const [pending, setPending] = useState(null)
  const [pendingProblem, setPendingProblem] = useState('')
  const [step, setStep] = useState(1)
  const [customers, setCustomers] = useState([])
  const [owedBy, setOwedBy] = useState({})
  const [creditBy, setCreditBy] = useState({})
  const [products, setProducts] = useState([])
  const [customer, setCustomer] = useState(null)
  const [lines, setLines] = useState([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [savedPending, setSavedPending] = useState(null)
  const [lastPrices, setLastPrices] = useState({})
  const [loadFailed, setLoadFailed] = useState(false)
  const [shareNote, setShareNote] = useState('')

  async function loadData() {
    setLoadFailed(false)
    const [c, p, b, o, po] = await Promise.all([
      selectAll(() => supabase.from('customers').select('*').order('name').order('id')),
      selectAll(() => supabase.from('products').select('*').eq('is_active', true).order('name').order('id')),
      selectAll(() => supabase.from('customer_balances').select('customer_id, owed, credit').or('owed.gt.0,credit.gt.0').order('customer_id')),
      selectAll(() => supabase.from('product_owed').select('product_id, owed_qty').order('product_id')),
      pendingId
        ? supabase.from('pending_orders')
          .select('id, customer_id, salesperson_id, notes, created_at, salesperson:profiles!pending_orders_salesperson_id_fkey(full_name), pending_order_items(position, product_id, name, qty, price, held_qty, products(name))')
          .eq('id', pendingId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    if (c.error || p.error || b.error || po.error) {
      setLoadFailed(true)
      return
    }
    setCustomers(c.data || [])
    const owedQty = {}
    for (const row of o.data || []) owedQty[row.product_id] = row.owed_qty
    // Stock a pending order holds is still available to that order
    const held = {}
    for (const item of po.data?.pending_order_items || []) {
      if (item.product_id) held[item.product_id] = (held[item.product_id] || 0) + item.held_qty
    }
    const prods = (p.data || []).map((prod) => ({ ...prod, stock_qty: prod.stock_qty + (held[prod.id] || 0), owed_qty: owedQty[prod.id] || 0 }))
    setProducts(prods)
    const owed = {}
    const credit = {}
    for (const row of b.data || []) {
      if (Number(row.owed) > 0) owed[row.customer_id] = Number(row.owed)
      if (Number(row.credit) > 0) credit[row.customer_id] = Number(row.credit)
    }
    setOwedBy(owed)
    setCreditBy(credit)

    // First load only: open a pending order (?pending=), start for a customer chosen elsewhere (?customer=),
    // or pick up an unfinished order
    if (started.current) return
    started.current = true
    if (pendingId) {
      openPending(po.data, c.data || [], prods)
      return
    }
    const wanted = params.get('customer')
    const draft = readDraft(profile.id)
    if (wanted) {
      const found = (c.data || []).find((x) => x.id === wanted)
      if (found) {
        setCustomer(found)
        setStep(2)
        if (draft?.customerId !== wanted) clearDraft(profile.id)
        else restore(draft, found, prods)
      }
      return
    }
    if (draft) {
      const found = (c.data || []).find((x) => x.id === draft.customerId)
      if (found) restore(draft, found, prods)
      else clearDraft(profile.id)
    }
  }

  function openPending(row, allCustomers, prods) {
    if (!row) {
      setPendingProblem('This pending order was already finished or deleted.')
      return
    }
    const salesperson = row.salesperson?.full_name || 'someone'
    if (row.salesperson_id !== profile.id && profile.role !== 'admin') {
      setPendingProblem('Only ' + salesperson + ' or an admin can finish this pending order.')
      return
    }
    const found = allCustomers.find((x) => x.id === row.customer_id)
    if (!found) {
      setPendingProblem('The customer on this pending order was not found.')
      return
    }
    const opened = []
    const dropped = []
    for (const item of [...row.pending_order_items].sort((a, b) => a.position - b.position)) {
      const price = item.price == null ? '' : String(Number(item.price))
      if (!item.product_id) {
        opened.push({ key: extraKey(), product: null, name: item.name, qty: String(item.qty), price, priceHint: null, ok: false })
        continue
      }
      const product = prods.find((x) => x.id === item.product_id)
      // Removed from inventory since it was saved: left out, and its held stock goes back when saved
      if (!product) {
        dropped.push(item.products?.name || 'a removed product')
        continue
      }
      // Running short was already accepted when it was saved
      opened.push({ key: product.id, product, qty: String(item.qty), price, priceHint: null, ok: item.qty > product.stock_qty })
    }
    setCustomer(found)
    setLines(opened)
    setStep(opened.length > 0 ? 3 : 2)
    setPending({ salesperson, createdAt: row.created_at, notes: row.notes, dropped })
  }

  function restore(draft, found, prods) {
    const restoredLines = (draft.lines || [])
      .map((l) => (l.productId
        ? { ...l, key: l.productId, product: prods.find((p) => p.id === l.productId) }
        : { ...l, key: l.key || extraKey(), product: null, name: l.name || '' }))
      .filter((l) => !l.productId || l.product)
      .map(({ productId, ...l }) => ({ ...l, ok: false }))
    setCustomer(found)
    setLines(restoredLines)
    setStep(restoredLines.length > 0 ? Math.min(draft.step || 2, 3) : 2)
    setRestoredAt(draft.savedAt)
  }

  useEffect(() => { loadData(); loadPdf() }, [])

  // Keep the unfinished order on this device (a pending order is already kept in the database)
  useEffect(() => {
    if (!started.current || done || savedPending || pendingId) return
    if (!customer) return
    try {
      localStorage.setItem(draftKey(profile.id), JSON.stringify({
        customerId: customer.id,
        step,
        savedAt: new Date().toISOString(),
        lines: lines.map((l) => ({ key: l.key, productId: l.product ? l.product.id : null, name: l.name, qty: l.qty, price: l.price, priceHint: l.priceHint })),
      }))
    } catch { /* storage full or blocked: the order still works, it just isn't kept */ }
  }, [customer, lines, step, done, savedPending])

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
    const exists = lines.find((l) => l.key === product.id)
    if (exists) setLines(lines.filter((l) => l.key !== product.id))
    else {
      const last = lastPrices[product.id]
      const value = last ? String(Number(last.price)) : ''
      const priceHint = last ? { value, label: last.for_customer ? "This customer's last price" : 'Last price used' } : null
      setLines([...lines, { key: product.id, product, qty: '1', price: value, priceHint, ok: false }])
    }
  }

  function addExtra() {
    setLines([...lines, { key: extraKey(), product: null, name: '', qty: '1', price: '', priceHint: null, ok: false }])
    setStep(3)
  }

  function updateLine(key, changes) {
    setLines(lines.map((l) => (l.key === key ? { ...l, ...changes } : l)))
  }

  function removeLine(key) {
    const rest = lines.filter((l) => l.key !== key)
    setLines(rest)
    if (rest.length === 0) setStep(2)
  }

  async function savePending(note) {
    setSaving(true)
    setError('')
    const { error } = await supabase.rpc('save_pending_order', {
      p_customer_id: customer.id,
      p_items: orderLines(lines),
      p_notes: note,
      ...(pendingId ? { p_pending_id: pendingId } : {}),
    })
    if (error) {
      setError(errorText(error))
      setSaving(false)
      return
    }
    if (!pendingId) clearDraft(profile.id)
    setSavedPending({ updated: !!pendingId, missing: lines.filter((l) => lineState(l).priceBlank).length })
    setPendingOpen(false)
    setSaving(false)
  }

  async function submit({ paid, method, dueDate, notes, useCredit }) {
    setSaving(true)
    setError('')
    // What we expect to be owed, from the stock shown on screen, to spot stock that changed meanwhile
    const expectedOwed = {}
    for (const l of lines) if (l.product) expectedOwed[l.product.id] = Math.max(0, Number(l.qty) - l.product.stock_qty)

    const { data: orderId, error } = await supabase.rpc('create_order', {
      p_customer_id: customer.id,
      p_items: orderLines(lines),
      p_amount_paid: paid,
      p_method: method,
      p_due_date: dueDate,
      p_notes: notes,
      p_use_credit: !!useCredit,
      ...(pendingId ? { p_pending_id: pendingId } : {}),
    })
    if (error) {
      setError(errorText(error))
      setSaving(false)
      return
    }

    // Build the invoice from what was actually saved (stock may have changed since this page loaded)
    const { data: order } = await supabase.from('orders')
      .select('order_number, created_at, previous_balance, due_date, notes, salesperson:profiles!orders_salesperson_id_fkey(full_name), order_items(product_id, qty, price, pending_qty, product_name, products(name)), payments(amount, note, receipt_id)')
      .eq('id', orderId).single()
    // Money now on this order: cash received today plus any credit used
    let onOrder = 0
    let cashOnOrder = 0
    let fromCredit = 0
    let receiptId = null
    for (const p of order.payments) {
      onOrder += Number(p.amount)
      if (p.note === 'From customer credit') fromCredit += Number(p.amount)
      else { cashOnOrder += Number(p.amount); receiptId = p.receipt_id }
    }
    const stockChanged = order.order_items
      .filter((i) => i.product_id && i.pending_qty > (expectedOwed[i.product_id] || 0))
      .map((i) => ({ name: i.product_name || i.products.name, extra: i.pending_qty - (expectedOwed[i.product_id] || 0) }))
    const invoice = {
      receiptId,
      cashPaid: paid,
      fromCredit,
      paidBeyondOrder: Math.max(0, paid - cashOnOrder),
      stockChanged,
      invoiceNumber: invoiceNumber(order.order_number),
      date: order.created_at,
      dueDate: order.due_date,
      customer,
      salesperson: order.salesperson?.full_name || profile.full_name,
      paid: onOrder,
      previousBalance: Number(order.previous_balance),
      notes: order.notes,
      items: order.order_items.map((item) => ({
        name: item.product_name || item.products?.name,
        qty: item.qty,
        price: Number(item.price),
        pending_qty: item.pending_qty,
      })),
    }
    if (!pendingId) clearDraft(profile.id)
    downloadInvoice(invoice)
    setDone(invoice)
    setConfirmOpen(false)
    setSaving(false)
  }

  function reset() {
    // Leaving a pending order: the page starts fresh (and the user's own unfinished order comes back)
    if (pendingId) {
      navigate('/orders/new')
      return
    }
    clearDraft(profile.id)
    setRestoredAt(null)
    setStep(1)
    setCustomer(null)
    setLines([])
    setDone(null)
    setSavedPending(null)
    setShareNote('')
    loadData()
  }

  if (savedPending) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl text-amber-600">⏸</div>
        <h1 className="mt-5 text-xl font-bold">{savedPending.updated ? 'Pending order updated' : 'Saved as pending'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {customer.name} · {savedPending.missing > 0
            ? savedPending.missing + ' price' + (savedPending.missing === 1 ? '' : 's') + ' still needed'
            : 'all prices filled in'}
        </p>
        <p className="mt-3 text-sm text-slate-500">
          No invoice yet, and the customer owes nothing until it is finished. The items are held for them.
          Finish it from the Orders page{savedPending.updated || profile.role === 'admin' ? '.' : '. The admins have been notified.'}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/orders" className="btn">View pending orders</Link>
          <button onClick={reset} className="btn-ghost">New order</button>
        </div>
      </div>
    )
  }

  if (done) {
    const t = invoiceTotals(done)
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
        <h1 className="mt-5 text-xl font-bold">Invoice {done.invoiceNumber} created</h1>
        <p className="mt-1 text-sm text-slate-500">{done.customer.name} · {money(t.subtotal)} · paid {money(t.paid)}</p>
        {done.fromCredit > 0 && (
          <p className="mt-1 text-sm text-indigo-700">{money(done.fromCredit)} of that came from their credit</p>
        )}
        {done.paidBeyondOrder > 0 && (
          <p className="mt-1 text-sm text-emerald-700">Plus {money(done.paidBeyondOrder)} toward earlier invoices or kept as credit (see the receipt)</p>
        )}
        {done.stockChanged.length > 0 && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
            <div className="font-semibold">Stock changed while you were ordering</div>
            Someone else sold some of these at the same time, so these will be delivered later:
            <ul className="mt-1 list-disc pl-5">
              {done.stockChanged.map((c) => <li key={c.name}>{c.extra} x {c.name}</li>)}
            </ul>
            It's marked on the invoice. Let the customer know.
          </div>
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
            <div className="font-medium">Receipt for the {money(done.cashPaid)} received</div>
            <ReceiptActions receiptId={done.receiptId} className="mt-1 block" />
          </div>
        )}
      </div>
    )
  }

  let total = 0
  for (const l of lines) total += Number(l.qty) * price2(l.price)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{pendingId ? 'Finish pending order' : 'New order'}</h1>
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

      {pendingProblem && (
        <div className="rounded-xl bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
          {pendingProblem} <Link to="/orders" className="font-medium text-indigo-700 hover:underline">Back to orders</Link>
        </div>
      )}

      {pending && (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>
            Pending order saved by <b>{pending.salesperson}</b> on {new Date(pending.createdAt).toLocaleString()}.
            Fill in the missing prices and finish it, or save your changes for later.
            {pending.notes && <div className="mt-1">Note: {pending.notes}</div>}
            {pending.dropped.length > 0 && (
              <div className="mt-1 font-medium">No longer in inventory, so left out: {pending.dropped.join(', ')}</div>
            )}
          </div>
          <button onClick={reset} className="font-medium text-amber-800 hover:underline">Leave</button>
        </div>
      )}

      {restoredAt && customer && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <span>Continuing your unfinished order for <b>{customer.name}</b> from {new Date(restoredAt).toLocaleString()}.</span>
          <button onClick={reset} className="font-medium text-indigo-700 hover:underline">Start over</button>
        </div>
      )}

      {!pendingProblem && (!pendingId || pending) && (
        <>
          {step === 1 && <CustomerStep customers={customers} owedBy={owedBy} creditBy={creditBy} onPick={(c) => { setCustomer(c); setStep(2) }} />}

          {step === 2 && (
            <ItemsStep products={products} selectedIds={lines.filter((l) => l.product).map((l) => l.product.id)} count={lines.length}
              onToggle={toggleProduct} onAddExtra={addExtra} onBack={() => setStep(1)} onNext={() => setStep(3)} />
          )}

          {step === 3 && (
            <ReviewStep lines={lines} isPending={!!pendingId} onChange={updateLine} onRemove={removeLine} onAddExtra={addExtra}
              onBack={() => setStep(2)} onCheckout={() => { setError(''); setConfirmOpen(true) }}
              onSavePending={() => { setError(''); setPendingOpen(true) }} />
          )}
        </>
      )}

      {confirmOpen && (
        <CheckoutModal customer={customer} previousBalance={owedBy[customer.id] || 0} credit={creditBy[customer.id] || 0} lines={lines} total={total}
          saving={saving} error={error} onClose={() => setConfirmOpen(false)} onSubmit={submit} />
      )}

      {pendingOpen && (
        <SavePendingModal customer={customer} lines={lines} note={pending?.notes} saving={saving} error={error}
          onClose={() => setPendingOpen(false)} onSubmit={savePending} />
      )}
    </div>
  )
}
