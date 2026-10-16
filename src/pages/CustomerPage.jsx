import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, selectAll } from '../supabase'
import { useAuth } from '../AuthContext'
import LoadError from '../components/LoadError'
import ConfirmDialog from '../components/ConfirmDialog'
import ReceiptActions from '../components/ReceiptActions'
import { money, methodLabel, receiptNumber } from '../format'
import { loadPdf } from '../invoice'
import { CustomerPayment, CustomerForm, OpeningBalanceForm, StatementButtons } from './customers/dialogs'
import { errorText } from '../errors'

function Stat({ label, value, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={'mt-1 text-lg font-bold ' + (tone || 'text-slate-900')}>{value}</div>
    </div>
  )
}

export default function CustomerPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile.role === 'admin'
  const [customer, setCustomer] = useState(null)
  const [orders, setOrders] = useState([])
  const [receipts, setReceipts] = useState([])
  const [failed, setFailed] = useState(false)
  const [missing, setMissing] = useState(false)
  const [dialog, setDialog] = useState(null)   // 'pay' | 'edit' | 'opening' | 'credit'
  const [newReceipt, setNewReceipt] = useState(null)
  const [note, setNote] = useState('')

  async function load() {
    setFailed(false)
    const [c, o, r] = await Promise.all([
      supabase.from('customer_balances').select('*').eq('customer_id', id).maybeSingle(),
      selectAll(() => supabase.from('order_list').select('*').eq('customer_id', id).order('created_at', { ascending: false }).order('id')),
      selectAll(() => supabase.from('receipts')
        .select('id, receipt_number, created_at, amount, method, note, reversed_at, receiver:profiles!receipts_created_by_fkey(full_name)')
        .eq('customer_id', id).order('created_at', { ascending: false }).order('id')),
    ])
    if (c.error || o.error || r.error) {
      setFailed(true)
      return
    }
    if (!c.data) {
      setMissing(true)
      return
    }
    setCustomer(c.data)
    setOrders(o.data)
    setReceipts(r.data)
  }

  useEffect(() => { load(); loadPdf() }, [id])

  async function useCredit() {
    const { data, error } = await supabase.rpc('apply_customer_credit', { p_customer_id: id })
    if (error) return errorText(error)
    setDialog(null)
    setNote(money(data) + ' of credit was used to pay their invoices.')
    load()
  }

  if (failed) return <LoadError onRetry={load} />
  if (missing) return <div className="card p-8 text-center text-sm text-slate-500">This customer doesn't exist. <Link to="/customers" className="text-indigo-600 hover:underline">Back to customers</Link></div>
  if (!customer) return <div className="text-slate-500">Loading...</div>

  const owed = Number(customer.owed)
  const credit = Number(customer.credit)

  return (
    <div className="space-y-6">
      <div>
        <Link to="/customers" className="text-sm text-slate-500 hover:text-indigo-600">← Customers</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{customer.name}</h1>
            <p className="text-sm text-slate-500">{[customer.phone, customer.email, customer.location].filter(Boolean).join(' · ') || 'No contact details yet'}</p>
          </div>
          <button onClick={() => navigate('/orders/new?customer=' + id)} className="btn">+ New order</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bought" value={money(customer.total)} />
        <Stat label="Paid" value={money(customer.paid)} tone="text-emerald-600" />
        <Stat label={Number(customer.overdue) > 0.005 ? 'Owes (' + money(customer.overdue) + ' overdue)' : 'Owes'}
          value={owed > 0.005 ? money(owed) : 'Nothing'} tone={owed > 0.005 ? 'text-red-600' : 'text-slate-400'} />
        <Stat label="Credit for future orders" value={credit > 0.005 ? money(credit) : 'None'} tone={credit > 0.005 ? 'text-indigo-700' : 'text-slate-400'} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setDialog('pay')} className="btn-ghost">{owed > 0.005 ? 'Record payment' : 'Record deposit'}</button>
        {credit > 0.005 && owed > 0.005 && <button onClick={() => setDialog('credit')} className="btn-ghost">Use credit to pay what they owe</button>}
        {Number(customer.orders) > 0 && <StatementButtons row={customer} onNote={setNote} />}
        <button onClick={() => setDialog('edit')} className="btn-ghost">Edit details</button>
        {isAdmin && <button onClick={() => setDialog('opening')} className="btn-ghost">Add opening balance</button>}
      </div>

      {note && <p className="text-sm text-slate-600">{note}</p>}
      {newReceipt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="font-medium">Payment saved.</span>
          <ReceiptActions receiptId={newReceipt} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold">Invoices ({orders.length})</div>
          <div className="divide-y divide-slate-100">
            {orders.map((o) => {
              const balance = Number(o.balance)
              return (
                <button key={o.id} onClick={() => navigate('/orders?order=' + o.id)}
                  className={'flex w-full items-start justify-between gap-3 px-5 py-3 text-left text-sm hover:bg-slate-50 ' + (o.cancelled_at ? 'text-slate-400' : '')}>
                  <span>
                    <span className={'font-medium ' + (o.cancelled_at ? 'line-through' : '')}>{o.invoice_number}</span>
                    {o.is_opening && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">opening balance</span>}
                    {o.cancelled_at && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">cancelled</span>}
                    {o.overdue && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">overdue</span>}
                    <span className="block text-xs text-slate-400">{new Date(o.created_at).toLocaleDateString()} · {o.salesperson}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold">{o.cancelled_at ? '-' : money(o.total)}</span>
                    {!o.cancelled_at && (
                      <span className={'text-xs font-semibold ' + (balance > 0.005 ? 'text-red-600' : 'text-emerald-600')}>
                        {balance > 0.005 ? 'owes ' + money(balance) : 'Paid'}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
            {orders.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No invoices yet</div>}
          </div>
        </div>

        <div className="card">
          <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold">Money received ({receipts.length})</div>
          <div className="divide-y divide-slate-100">
            {receipts.map((r) => (
              <div key={r.id} className={'flex items-start justify-between gap-3 px-5 py-3 text-sm ' + (r.reversed_at ? 'text-slate-400' : '')}>
                <span>
                  <span className="font-medium">{receiptNumber(r.receipt_number)}</span>
                  {r.reversed_at && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">reversed</span>}
                  <span className="block text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleDateString()} · {methodLabel(r.method)}{r.receiver?.full_name ? ' · ' + r.receiver.full_name : ''}
                    {r.note ? ' · ' + r.note : ''}
                  </span>
                  <ReceiptActions receiptId={r.id} label="" className="mt-1 block" />
                </span>
                <span className={'shrink-0 font-semibold ' + (r.reversed_at ? 'line-through' : 'text-emerald-600')}>{money(r.amount)}</span>
              </div>
            ))}
            {receipts.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">No payments yet</div>}
          </div>
        </div>
      </div>

      {dialog === 'pay' && (
        <CustomerPayment customer={customer} onClose={() => setDialog(null)}
          onSaved={(rid) => { setDialog(null); setNewReceipt(rid); load() }} />
      )}
      {dialog === 'edit' && (
        <CustomerForm customer={customer} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />
      )}
      {dialog === 'opening' && (
        <OpeningBalanceForm customer={customer} onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); setNote('Opening balance saved.'); load() }} />
      )}
      {dialog === 'credit' && (
        <ConfirmDialog title="Use credit?" confirmLabel="Yes, use credit"
          text={'Up to ' + money(Math.min(credit, owed)) + ' of their ' + money(credit) + ' credit will pay their oldest unpaid invoices.'}
          onClose={() => setDialog(null)} onConfirm={useCredit} />
      )}
    </div>
  )
}
