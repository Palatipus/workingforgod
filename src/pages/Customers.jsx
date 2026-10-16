import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, selectAll, onTableChanges } from '../supabase'
import LoadError from '../components/LoadError'
import { money } from '../format'
import { CustomerForm } from './customers/dialogs'

function Owes({ row }) {
  const owed = Number(row.owed)
  const credit = Number(row.credit)
  return (
    <div className="text-right">
      {owed > 0.005
        ? <span className="font-semibold text-red-600">{money(owed)}</span>
        : <span className="text-slate-400">-</span>}
      {Number(row.overdue) > 0.005 && <div className="text-xs font-semibold text-red-600">{money(row.overdue)} overdue</div>}
      {credit > 0.005 && <div className="text-xs font-semibold text-indigo-700">{money(credit)} credit</div>}
    </div>
  )
}

export default function Customers() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data, error } = await selectAll(() =>
      supabase.from('customer_balances').select('*').order('owed', { ascending: false }).order('name').order('customer_id'))
    setLoading(false)
    if (error) {
      setLoadFailed(true)
      return
    }
    setLoadFailed(false)
    setRows(data || [])
  }

  useEffect(() => {
    load()
    // Receipts and refunds too, so deposits and refunds show without a refresh
    return onTableChanges('customers-live', ['orders', 'order_items', 'payments', 'receipts', 'refunds'], load)
  }, [])

  const shown = rows.filter((r) => {
    const text = (r.name + ' ' + (r.phone || '') + ' ' + (r.location || '')).toLowerCase()
    if (!text.includes(search.toLowerCase())) return false
    if (onlyOwing && Number(r.owed) <= 0.005) return false
    return true
  })

  let totalOwed = 0
  let totalOverdue = 0
  let totalCredit = 0
  for (const r of rows) {
    if (Number(r.owed) > 0) totalOwed += Number(r.owed)
    if (Number(r.overdue) > 0) totalOverdue += Number(r.overdue)
    if (Number(r.credit) > 0) totalCredit += Number(r.credit)
  }

  const open = (r) => navigate('/customers/' + r.customer_id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Tap a customer to see their orders, payments, credit and statement.</p>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-500">Owed to the business</div>
            <div className="text-xl font-bold text-red-600">{money(totalOwed)}</div>
            {totalOverdue > 0.005 && <div className="text-xs font-semibold text-red-600">{money(totalOverdue)} overdue</div>}
            {totalCredit > 0.005 && <div className="text-xs font-semibold text-indigo-700">{money(totalCredit)} held as credit</div>}
          </div>
          <button onClick={() => setAdding(true)} className="btn">+ Add customer</button>
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

      {loadFailed && <LoadError onRetry={load} />}

      {/* Phones */}
      <div className="card divide-y divide-slate-100 md:hidden">
        {shown.map((r) => (
          <button key={r.customer_id} onClick={() => open(r)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              <div className="truncate text-xs text-slate-400">{[r.phone, r.location].filter(Boolean).join(' · ') || ' '}</div>
            </div>
            <Owes row={r} />
          </button>
        ))}
        {!loading && !loadFailed && shown.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">No customers found</div>}
      </div>

      {/* Bigger screens */}
      <div className="hidden overflow-x-auto card md:block">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3 text-center">Orders</th>
              <th className="px-5 py-3 text-right">Bought</th>
              <th className="px-5 py-3 text-right">Paid</th>
              <th className="px-5 py-3 text-right">Owes</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.customer_id} onClick={() => open(r)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3">
                  <div className="font-medium">{r.name}</div>
                  {r.location && <div className="text-xs text-slate-400">{r.location}</div>}
                </td>
                <td className="px-5 py-3 text-slate-500">{r.phone}</td>
                <td className="px-5 py-3 text-center">{r.orders}</td>
                <td className="px-5 py-3 text-right">{money(r.total)}</td>
                <td className="px-5 py-3 text-right text-emerald-600">{money(r.paid)}</td>
                <td className="px-5 py-3"><Owes row={r} /></td>
              </tr>
            ))}
            {!loading && !loadFailed && shown.length === 0 && (
              <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-400">No customers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <CustomerForm others={rows} onClose={() => setAdding(false)}
          onSaved={(id) => { setAdding(false); navigate('/customers/' + id) }} />
      )}
    </div>
  )
}
