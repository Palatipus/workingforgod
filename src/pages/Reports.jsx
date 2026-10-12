import { useState } from 'react'
import { supabase } from '../supabase'
import DateRange, { applyRange, rangeLabel } from '../components/DateRange'
import { toCsv, downloadCsv, fetchAll, dateTime, num } from '../csv'
import { invoiceNumber } from '../invoice'
import { methodLabel, receiptNumber, refundNumber, movementLabels } from '../format'

// Each export: what it is, whether it uses the date range, and how to build its rows
const exports = [
  {
    key: 'invoices',
    title: 'Invoices',
    text: 'One row per invoice: customer, salesperson, total, paid, balance, due date and status.',
    dated: true,
    async build(range) {
      const rows = await fetchAll(() => applyRange(supabase.from('order_list').select('*').order('created_at'), range))
      return toCsv(
        ['Invoice', 'Date', 'Customer', 'Salesperson', 'Total', 'Paid', 'Balance', 'Due date', 'Overdue', 'Pending delivery', 'Cancelled'],
        rows.map((o) => [o.invoice_number, dateTime(o.created_at), o.customer_name, o.salesperson, num(o.total), num(o.paid),
          num(o.balance), o.due_date || '', o.overdue ? 'Yes' : '', o.has_pending ? 'Yes' : '', o.cancelled_at ? dateTime(o.cancelled_at) : '']),
      )
    },
  },
  {
    key: 'sales',
    title: 'Sales by item',
    text: 'Every product sold: invoice, quantity, price and amount. Good for "what sold most" in a pivot table.',
    dated: true,
    async build(range) {
      const rows = await fetchAll(() => applyRange(
        supabase.from('order_items')
          .select('qty, price, pending_qty, product_name, products(name, brand, category), orders!inner(order_number, created_at, cancelled_at, customer_name, salesperson:profiles!orders_salesperson_id_fkey(full_name))')
          .is('orders.cancelled_at', null)
          .order('id'),
        range, 'orders.created_at'))
      rows.sort((a, b) => a.orders.created_at.localeCompare(b.orders.created_at))
      return toCsv(
        ['Invoice', 'Date', 'Customer', 'Salesperson', 'Product', 'Brand', 'Category', 'Qty', 'Unit price', 'Amount', 'Still owed'],
        rows.filter((r) => r.qty > 0).map((r) => [invoiceNumber(r.orders.order_number), dateTime(r.orders.created_at), r.orders.customer_name,
          r.orders.salesperson?.full_name, r.product_name || r.products?.name, r.products?.brand, r.products?.category,
          r.qty, num(r.price), num(r.qty * r.price), r.pending_qty || '']),
      )
    },
  },
  {
    key: 'receipts',
    title: 'Payments received',
    text: 'Every receipt: amount, method (cash, mobile money, bank) and who received it. Use this to check takings.',
    dated: true,
    async build(range) {
      const rows = await fetchAll(() => applyRange(
        supabase.from('receipts')
          .select('receipt_number, created_at, amount, method, note, reversed_at, customers(name), receiver:profiles!receipts_created_by_fkey(full_name)')
          .order('created_at'),
        range))
      return toCsv(
        ['Receipt', 'Date', 'Customer', 'Amount', 'Method', 'Received by', 'Note', 'Reversed'],
        rows.map((r) => [receiptNumber(r.receipt_number), dateTime(r.created_at), r.customers?.name, num(r.amount),
          methodLabel(r.method), r.receiver?.full_name, r.note, r.reversed_at ? dateTime(r.reversed_at) : '']),
      )
    },
  },
  {
    key: 'refunds',
    title: 'Refunds',
    text: 'Money given back to customers after returns.',
    dated: true,
    async build(range) {
      const rows = await fetchAll(() => applyRange(
        supabase.from('refunds').select('refund_number, created_at, amount, method, note, orders(order_number, customer_name), profiles(full_name)').order('created_at'),
        range))
      return toCsv(
        ['Refund', 'Date', 'Invoice', 'Customer', 'Amount', 'Method', 'By', 'Reason'],
        rows.map((r) => [refundNumber(r.refund_number), dateTime(r.created_at), invoiceNumber(r.orders.order_number),
          r.orders.customer_name, num(r.amount), methodLabel(r.method), r.profiles?.full_name, r.note]),
      )
    },
  },
  {
    key: 'debts',
    title: 'Customer balances',
    text: 'What every customer has bought, paid and still owes today, including overdue amounts.',
    dated: false,
    async build() {
      const rows = await fetchAll(() => supabase.from('customer_balances').select('*').order('name'))
      return toCsv(
        ['Customer', 'Phone', 'Email', 'Location', 'Orders', 'Bought', 'Paid', 'Owes', 'Overdue'],
        rows.map((c) => [c.name, c.phone, c.email, c.location, c.orders, num(c.total), num(c.paid), num(c.owed), num(c.overdue)]),
      )
    },
  },
  {
    key: 'stock',
    title: 'Stock levels',
    text: 'Every product with stock today, reorder level and how many are owed to customers.',
    dated: false,
    async build() {
      const [products, owed] = await Promise.all([
        fetchAll(() => supabase.from('products').select('id, name, brand, category, stock_qty, reorder_level').eq('is_active', true).order('name')),
        fetchAll(() => supabase.from('product_owed').select('*')),
      ])
      const owedBy = {}
      for (const o of owed) owedBy[o.product_id] = o.owed_qty
      return toCsv(
        ['Product', 'Brand', 'Category', 'In stock', 'Reorder level', 'Owed to customers', 'Status'],
        products.map((p) => [p.name, p.brand, p.category, p.stock_qty, p.reorder_level, owedBy[p.id] || 0,
          p.stock_qty === 0 ? 'Out of stock' : p.stock_qty <= p.reorder_level ? 'Low' : 'OK']),
      )
    },
  },
  {
    key: 'movements',
    title: 'Stock movements',
    text: 'Every change to stock: received, sold, delivered, returned, cancelled and adjusted, with who did it.',
    dated: true,
    async build(range) {
      const rows = await fetchAll(() => applyRange(
        supabase.from('stock_movements').select('created_at, kind, change, balance_after, note, products(name), orders(order_number), profiles(full_name)').order('created_at'),
        range))
      return toCsv(
        ['Date', 'Product', 'What', 'Change', 'Stock after', 'Invoice', 'By', 'Note'],
        rows.map((m) => [dateTime(m.created_at), m.products?.name, movementLabels[m.kind] || m.kind, m.change, m.balance_after,
          m.orders ? invoiceNumber(m.orders.order_number) : '', m.profiles?.full_name, m.note]),
      )
    },
  },
]

export default function Reports() {
  const [range, setRange] = useState({ preset: 'month' })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)

  async function run(item) {
    setBusy(item.key)
    setMessage(null)
    try {
      const csv = await item.build(range)
      const lines = csv.split('\r\n').length - 1
      downloadCsv(item.key + (item.dated ? '_' + rangeLabel(range) : '_' + new Date().toISOString().slice(0, 10)), csv)
      setMessage({ ok: true, text: item.title + ': ' + lines + ' row' + (lines === 1 ? '' : 's') + ' downloaded.' })
    } catch {
      setMessage({ ok: false, text: 'Could not make the ' + item.title.toLowerCase() + ' file. Check your connection and try again.' })
    }
    setBusy('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Download spreadsheets (CSV) that open in Excel or Google Sheets, e.g. for your accountant.</p>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm font-medium text-slate-600">Period</span>
        <DateRange value={range} onChange={setRange} />
      </div>

      {message && (
        <div className={'rounded-xl px-4 py-3 text-sm ' + (message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900')}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {exports.map((item) => (
          <div key={item.key} className="card flex flex-col p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">{item.title}</div>
              <span className="text-xs text-slate-400">{item.dated ? 'For the period above' : 'As of today'}</span>
            </div>
            <p className="mt-1 flex-1 text-sm text-slate-500">{item.text}</p>
            <button disabled={!!busy} onClick={() => run(item)} className="btn mt-4 self-start">
              {busy === item.key ? 'Preparing...' : 'Download'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
