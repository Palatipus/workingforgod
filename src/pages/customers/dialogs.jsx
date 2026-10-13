import { useState } from 'react'
import { supabase, selectAll } from '../../supabase'
import Modal from '../../components/Modal'
import { money, paymentMethods, today } from '../../format'
import { downloadStatement, shareStatement, shareNotice, invoiceNumber } from '../../invoice'

// customer: a row from customer_balances (customer_id, name, owed, credit, ...)

// Payment from a customer. Clears their oldest debts first; anything above what they owe is kept as credit.
export function CustomerPayment({ customer, onClose, onSaved }) {
  const owed = Number(customer.owed)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const n = Math.round(Number(amount || 0) * 100) / 100
  const toDebt = Math.min(n, Math.max(0, owed))
  const toCredit = Math.max(0, n - toDebt)

  async function save(e) {
    e.preventDefault()
    if (!(n > 0)) return setError('Enter an amount above 0.')
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('record_customer_payment', {
      p_customer_id: customer.customer_id, p_amount: n, p_method: method, p_note: note || null,
    })
    setSaving(false)
    if (error) return setError(error.message)
    onSaved(data)
  }

  return (
    <Modal title={(owed > 0 ? 'Payment from ' : 'Deposit from ') + customer.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="text-sm text-slate-500">
          {owed > 0
            ? <>Owes <span className="font-semibold text-red-600">{money(owed)}</span>. The payment clears their oldest unpaid invoices first. </>
            : <>Owes nothing right now. </>}
          Anything above what they owe is kept as credit for future orders.
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Amount (GH₵)</label>
            {owed > 0 && (
              <button type="button" onClick={() => setAmount(owed.toFixed(2))} className="text-xs font-medium text-indigo-600 hover:underline">
                Everything owed
              </button>
            )}
          </div>
          <input className="input" type="number" min="0.01" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
        {n > 0 && (
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
            {toDebt > 0 && <div className="flex justify-between"><span className="text-slate-500">Pays off debt</span><span className="font-semibold">{money(toDebt)}</span></div>}
            {toCredit > 0 && <div className="flex justify-between"><span className="text-slate-500">Kept as credit</span><span className="font-semibold text-indigo-700">{money(toCredit)}</span></div>}
          </div>
        )}
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
          {paymentMethods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input className="input" placeholder="Note (optional), e.g. MoMo ref or 'deposit for BS-240'" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save payment'}</button>
        </div>
      </form>
    </Modal>
  )
}

function digits(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-9)
}

// Add a customer (no `customer`) or edit one. `others` is used to warn about duplicates when adding.
export function CustomerForm({ customer, others = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    location: customer?.location || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dupeOk, setDupeOk] = useState(false)

  const name = form.name.trim().toLowerCase()
  const phone = digits(form.phone)
  const dupes = customer ? [] : others.filter((c) =>
    (name.length >= 3 && c.name.trim().toLowerCase() === name) || (phone.length >= 9 && digits(c.phone) === phone))

  async function save(e) {
    e.preventDefault()
    if (dupes.length > 0 && !dupeOk) return
    setSaving(true)
    setError('')
    const fields = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      location: form.location.trim() || null,
    }
    const { data, error } = customer
      ? await supabase.from('customers').update(fields).eq('id', customer.customer_id).select('id').single()
      : await supabase.from('customers').insert(fields).select('id').single()
    setSaving(false)
    if (error) return setError(error.message)
    onSaved(data.id)
  }

  return (
    <Modal title={customer ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <input className="input" placeholder="Customer or lab name" value={form.name} autoFocus
          onChange={(e) => { setForm({ ...form, name: e.target.value }); setDupeOk(false) }} required />
        <input className="input" placeholder="Phone" value={form.phone}
          onChange={(e) => { setForm({ ...form, phone: e.target.value }); setDupeOk(false) }} />
        <input className="input" type="email" placeholder="Email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Location" value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })} />

        {dupes.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">This customer may already exist:</div>
            <ul className="mt-1 list-disc pl-5">
              {dupes.slice(0, 3).map((c) => <li key={c.customer_id}>{c.name}{c.phone ? ' · ' + c.phone : ''}</li>)}
            </ul>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={dupeOk} onChange={(e) => setDupeOk(e.target.checked)} />
              No, this is a different customer
            </label>
          </div>
        )}

        {customer && <p className="text-xs text-slate-400">Invoices already issued keep the details they were issued with.</p>}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving || (dupes.length > 0 && !dupeOk)} className="btn">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Admins: record what a customer owed before the business started using the app
export function OpeningBalanceForm({ customer, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [asOf, setAsOf] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    const n = Math.round(Number(amount) * 100) / 100
    if (!(n > 0)) return setError('Enter the amount they owed.')
    setSaving(true)
    setError('')
    const { error } = await supabase.rpc('create_opening_balance', {
      p_customer_id: customer.customer_id, p_amount: n, p_as_of: asOf || null, p_note: note || null, p_due_date: dueDate || null,
    })
    setSaving(false)
    if (error) return setError(error.message)
    onSaved()
  }

  return (
    <Modal title={'Opening balance: ' + customer.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-500">
          For money this customer already owed before you started using the app. It appears as its own invoice
          marked "opening balance", and payments clear it before newer invoices. It doesn't count as a sale.
        </p>
        <div>
          <label className="text-xs text-slate-500">Amount owed (GH₵)</label>
          <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500">Owed as of (optional)</label>
            <input className="input" type="date" max={today()} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500">Due by (optional)</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <input className="input" placeholder="Note (optional), e.g. 'From the old ledger book'" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save opening balance'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Everything a statement needs for one customer
export async function statementData(row) {
  const [orders, payments, refunds] = await Promise.all([
    selectAll(() => supabase.from('order_list').select('id, invoice_number, created_at, due_date, total, paid, balance, overdue, is_opening')
      .eq('customer_id', row.customer_id).is('cancelled_at', null).order('created_at').order('id')),
    selectAll(() => supabase.from('payments').select('id, amount, method, paid_at, orders!inner(order_number, customer_id)')
      .eq('orders.customer_id', row.customer_id).order('paid_at').order('id')),
    selectAll(() => supabase.from('refunds').select('id, amount, method, created_at, orders!inner(order_number, customer_id)')
      .eq('orders.customer_id', row.customer_id).order('created_at').order('id')),
  ])
  if (orders.error || payments.error || refunds.error) throw new Error('load failed')
  const lines = [
    ...payments.data.map((p) => ({ ...p, refund: false })),
    ...refunds.data.map((r) => ({ ...r, paid_at: r.created_at, refund: true })),
  ].sort((a, b) => a.paid_at.localeCompare(b.paid_at))
  return {
    customer: { name: row.name, phone: row.phone, location: row.location },
    date: new Date().toISOString(),
    credit: Number(row.credit || 0),
    orders: orders.data.map((o) => ({ ...o, invoice_number: o.invoice_number + (o.is_opening ? ' (opening)' : '') })),
    payments: lines.map((p) => ({ ...p, invoice_number: invoiceNumber(p.orders.order_number) })),
  }
}

export function StatementButtons({ row, onNote }) {
  const [busy, setBusy] = useState(false)

  async function run(share) {
    setBusy(true)
    try {
      const data = await statementData(row)
      if (share) onNote(shareNotice(await shareStatement(data)))
      else await downloadStatement(data)
    } catch {
      onNote('Could not make the statement. Check your connection and try again.')
    }
    setBusy(false)
  }

  return (
    <>
      <button disabled={busy} onClick={() => run(false)} className="btn-ghost disabled:opacity-50">Statement</button>
      <button disabled={busy} onClick={() => run(true)} className="btn-ghost disabled:opacity-50">Share statement</button>
    </>
  )
}
