import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Modal from '../components/Modal'
import { money, paymentMethods } from '../format'

function CustomerPayment({ customer, onClose, onSaved }) {
  const owed = Number(customer.owed)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.rpc('record_customer_payment', {
      p_customer_id: customer.customer_id,
      p_amount: Math.round(Number(amount) * 100) / 100,
      p_method: method,
      p_note: note || null,
    })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  return (
    <Modal title={'Payment from ' + customer.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="text-sm text-slate-500">
          Owes <span className="font-semibold text-red-600">{money(owed)}</span>. The payment clears their oldest unpaid orders first.
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Amount (GH₵)</label>
            <button type="button" onClick={() => setAmount(owed.toFixed(2))} className="text-xs font-medium text-indigo-600 hover:underline">
              Everything owed
            </button>
          </div>
          <input className="input" type="number" min="0.01" step="0.01" max={owed} value={amount}
            onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
          {paymentMethods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save payment'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Customers() {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(false)
  const [paying, setPaying] = useState(null)

  async function load() {
    const { data } = await supabase.from('customer_balances').select('*').order('owed', { ascending: false }).order('name')
    setRows(data || [])
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('customers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const shown = rows.filter((r) => {
    const text = (r.name + ' ' + (r.phone || '') + ' ' + (r.location || '')).toLowerCase()
    if (!text.includes(search.toLowerCase())) return false
    if (onlyOwing && Number(r.owed) <= 0.005) return false
    return true
  })

  let totalOwed = 0
  for (const r of rows) if (Number(r.owed) > 0) totalOwed += Number(r.owed)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">What each customer has bought and what they still owe.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Total owed to the business</div>
          <div className="text-xl font-bold text-red-600">{money(totalOwed)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <input className="input md:max-w-sm" placeholder="Search customers" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} />
          Only customers who owe
        </label>
      </div>

      <div className="overflow-x-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3 text-center">Orders</th>
              <th className="px-5 py-3 text-right">Bought</th>
              <th className="px-5 py-3 text-right">Paid</th>
              <th className="px-5 py-3 text-right">Owes</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const owes = Number(r.owed) > 0.005
              return (
                <tr key={r.customer_id} className="border-t border-slate-100">
                  <td className="px-5 py-3">
                    <div className="font-medium">{r.name}</div>
                    {r.location && <div className="text-xs text-slate-400">{r.location}</div>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{r.phone}</td>
                  <td className="px-5 py-3 text-center">{r.orders}</td>
                  <td className="px-5 py-3 text-right">{money(r.total)}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{money(r.paid)}</td>
                  <td className={'px-5 py-3 text-right font-semibold ' + (owes ? 'text-red-600' : 'text-slate-400')}>
                    {owes ? money(r.owed) : '-'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {owes && (
                      <button onClick={() => setPaying(r)} className="btn !px-3 !py-1 text-xs">Record payment</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr><td colSpan="7" className="px-5 py-12 text-center text-slate-400">No customers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {paying && (
        <CustomerPayment customer={paying} onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); load() }} />
      )}
    </div>
  )
}
