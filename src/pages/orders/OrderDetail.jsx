import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../AuthContext'
import Modal from '../../components/Modal'
import LoadError from '../../components/LoadError'
import ConfirmDialog from '../../components/ConfirmDialog'
import DeliverDialog from '../../components/DeliverDialog'
import ReceiptActions, { RefundActions } from '../../components/ReceiptActions'
import { money, methodLabel, today, receiptNumber, refundNumber } from '../../format'
import { downloadInvoice, shareInvoice, shareNotice, invoiceNumber, loadPdf } from '../../invoice'
import PaymentForm from './PaymentForm'
import ReturnDialog from './ReturnDialog'
import { itemLabel } from './itemLabel'
import { errorText } from '../../errors'

// Everything about one order: items, deliveries, payments, returns, refunds, invoice and cancelling.
export default function OrderDetail({ orderId, version, onClose, onChanged }) {
  const { profile } = useAuth()
  const isAdmin = profile.role === 'admin'
  const [order, setOrder] = useState(null)
  const [earlierOwed, setEarlierOwed] = useState(0)
  const [missing, setMissing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [delivering, setDelivering] = useState(null)
  const [reversing, setReversing] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [returning, setReturning] = useState(false)
  const [showNewRefund, setShowNewRefund] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [shareNote, setShareNote] = useState('')
  const [newReceipt, setNewReceipt] = useState(null)

  async function load() {
    setFailed(false)
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, created_at, due_date, notes, cancelled_at, cancel_reason, customer_id, customer_name, customer_phone, customer_location, opening_amount, customers(name, phone, location), salesperson:profiles!orders_salesperson_id_fkey(full_name), canceller:profiles!orders_cancelled_by_fkey(full_name), order_items(id, qty, price, pending_qty, delivered_at, product_name, products(name)), payments(id, amount, method, note, paid_at, receipt_id, receipts(receipt_number, amount)), refunds(id, refund_number, amount, method, note, created_at), order_returns(id, item_id, owed_removed, returned, restocked, reason, created_at, profiles(full_name))')
      .eq('id', orderId)
      .maybeSingle()
    if (error) {
      setFailed(true)
      return
    }
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

  if (failed && !order) {
    return <Modal title="Order" onClose={onClose}><LoadError compact onRetry={load} /></Modal>
  }
  if (missing) {
    return <Modal title="Order not found" onClose={onClose}><p className="text-sm text-slate-500">This order does not exist.</p></Modal>
  }
  if (!order) return <Modal title="Loading..." onClose={onClose}><div className="h-24" /></Modal>

  const cancelled = !!order.cancelled_at
  // An opening balance is debt from before the app: no items, just an amount
  const opening = Number(order.opening_amount || 0)
  let total = opening
  for (const item of order.order_items) total += item.qty * item.price
  let paid = 0
  for (const p of order.payments) paid += Number(p.amount)
  let refunded = 0
  for (const r of order.refunds) refunded += Number(r.amount)
  paid -= refunded
  const itemName = {}
  for (const item of order.order_items) itemName[item.id] = itemLabel(item)
  const balance = cancelled ? 0 : Math.max(0, total - paid)
  const overdue = !cancelled && balance > 0.005 && order.due_date && order.due_date < today()

  function returnsSummary() {
    if (order.order_returns.length === 0) return ''
    return 'Returned: ' + order.order_returns
      .map((r) => (r.owed_removed + r.returned) + ' x ' + itemName[r.item_id] + ' (' + new Date(r.created_at).toLocaleDateString('en-GB') + ')')
      .join(', ') + '.' + (refunded > 0 ? ' Refunded ' + money(refunded) + '.' : '')
  }

  function invoiceData() {
    return {
      invoiceNumber: invoiceNumber(order.order_number),
      date: order.created_at,
      dueDate: order.due_date,
      // The customer details as they were when the invoice was issued
      customer: order.customer_name
        ? { name: order.customer_name, phone: order.customer_phone, location: order.customer_location }
        : order.customers,
      salesperson: order.salesperson?.full_name || '',
      paid,
      previousBalance: earlierOwed,
      notes: [order.notes, returnsSummary()].filter(Boolean).join('  '),
      items: [
        ...(opening > 0 ? [{ name: 'Opening balance brought forward', qty: 1, price: opening, pending_qty: 0 }] : []),
        ...order.order_items.filter((item) => item.qty > 0).map((item) => ({
          name: itemLabel(item),
          qty: item.qty,
          price: item.price,
          pending_qty: item.pending_qty,
        })),
      ],
    }
  }

  async function reversePayment() {
    const { error } = await supabase.rpc('reverse_payment', { p_payment_id: reversing.id })
    if (error) return errorText(error)
    setReversing(null)
    changed()
  }

  async function cancelOrder() {
    const { error } = await supabase.rpc('cancel_order', { p_order_id: order.id, p_reason: cancelReason })
    if (error) return errorText(error)
    setCancelling(false)
    changed()
  }

  return (
    <Modal title={invoiceNumber(order.order_number) + (cancelled ? ' (cancelled)' : '')} onClose={onClose} wide>
      {cancelled && (
        <div className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Cancelled on {new Date(order.cancelled_at).toLocaleDateString()}
          {order.canceller?.full_name ? ' by ' + order.canceller.full_name : ''}{order.cancel_reason ? ': ' + order.cancel_reason : ''}.
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

      {opening > 0 && (
        <div className="mt-6 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span><span className="font-semibold">Opening balance</span>: owed from before the app was used</span>
          <span className="font-bold">{money(opening)}</span>
        </div>
      )}

      {order.order_items.length > 0 && <div className="mt-6 overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr><th className="py-2">Item</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th><th className="py-2"></th></tr>
        </thead>
        <tbody>
          {order.order_items.map((item) => {
            const pending = item.pending_qty > 0
            return (
              <tr key={item.id} className={'border-t border-slate-100 ' + (pending ? 'bg-red-50 text-red-700' : item.qty === 0 ? 'text-slate-400' : '')}>
                <td className="py-3 font-medium">
                  {itemLabel(item)}
                  {item.qty === 0 && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">all returned</span>}
                </td>
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
      </table></div>}

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

      {(order.order_returns.length > 0 || order.refunds.length > 0) && (
        <div className="mt-4">
          <div className="text-xs uppercase text-slate-400">Returns and refunds</div>
          <div className="mt-1 divide-y divide-slate-100 text-sm">
            {order.order_returns.map((r) => (
              <div key={r.id} className="py-2 text-slate-600">
                {new Date(r.created_at).toLocaleDateString()} · {r.owed_removed + r.returned} x {itemName[r.item_id]}
                {r.returned > 0 ? (r.restocked ? ' · back in stock' : ' · not put back in stock') : ' · not yet delivered, removed'}
                {r.reason ? ' · ' + r.reason : ''}{r.profiles?.full_name ? ' · by ' + r.profiles.full_name : ''}
              </div>
            ))}
            {order.refunds.map((r) => (
              <div key={r.id} className="flex justify-between gap-3 py-2">
                <span className="text-slate-600">
                  {new Date(r.created_at).toLocaleDateString()} · Refund · {methodLabel(r.method)}
                  <span className="block text-xs">
                    <span className="text-slate-400">{refundNumber(r.refund_number)}</span>{' '}
                    <RefundActions refundId={r.id} label="" className="ml-1" />
                  </span>
                </span>
                <span className="font-semibold text-red-600">- {money(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {order.payments.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-slate-400">Payments</div>
          <div className="mt-1 divide-y divide-slate-100 text-sm">
            {[...order.payments].sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-600">
                  {new Date(p.paid_at).toLocaleDateString()} · {methodLabel(p.method)}{p.note ? ' · ' + p.note : ''}
                  {p.receipts && (
                    <span className="block text-xs">
                      <span className="text-slate-400">{receiptNumber(p.receipts.receipt_number)}</span>{' '}
                      <ReceiptActions receiptId={p.receipt_id} label="" className="ml-1" />
                    </span>
                  )}
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

      {showNewRefund && order.refunds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">Return saved and refund recorded. Give the customer the refund note.</span>
          <RefundActions refundId={[...order.refunds].sort((a, b) => b.refund_number - a.refund_number)[0].id} />
        </div>
      )}

      {newReceipt && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="font-medium">Payment saved.</span>
          <ReceiptActions receiptId={newReceipt} />
        </div>
      )}

      {!cancelled && balance > 0.005 && (
        <PaymentForm order={order} balance={balance} onSaved={(id) => { setNewReceipt(id); changed() }} />
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!cancelled && (
          <>
            <button onClick={() => downloadInvoice(invoiceData())} className="btn-ghost">Download invoice</button>
            <button onClick={async () => setShareNote(shareNotice(await shareInvoice(invoiceData())))} className="btn-ghost">Share</button>
          </>
        )}
        {!cancelled && (
          <span className="ml-auto flex gap-4">
            {order.order_items.some((i) => i.qty > 0) && (
              <button onClick={() => setReturning(true)} className="text-sm font-medium text-slate-600 hover:underline">
                Return items
              </button>
            )}
            <button onClick={() => { setCancelReason(''); setCancelling(true) }}
              className="text-sm font-medium text-red-600 hover:underline">
              Cancel order
            </button>
          </span>
        )}
      </div>
      {shareNote && <p className="mt-3 text-sm text-slate-500">{shareNote}</p>}

      {delivering && (
        <DeliverDialog item={delivering} productName={itemLabel(delivering)} customerName={order.customers?.name}
          onClose={() => setDelivering(null)} onDone={() => { setDelivering(null); changed() }} />
      )}

      {reversing && (
        <ConfirmDialog title="Reverse this payment?" confirmLabel="Yes, reverse"
          text={reversing.receipts && Number(reversing.receipts.amount) > Number(reversing.amount) + 0.005
            ? 'This reverses the whole receipt ' + receiptNumber(reversing.receipts.receipt_number) + ' (' + money(reversing.receipts.amount) +
              '), including the part that paid other invoices. All of it goes back onto the customer\'s balance.'
            : money(reversing.amount) + ' received on ' + new Date(reversing.paid_at).toLocaleDateString() + ' will be removed and added back to the balance.'}
          onClose={() => setReversing(null)} onConfirm={reversePayment} />
      )}

      {returning && (
        <ReturnDialog order={order} paid={paid} isAdmin={isAdmin}
          onClose={() => setReturning(false)} onDone={(refunded) => { setReturning(false); setShowNewRefund(refunded > 0); changed() }} />
      )}

      {cancelling && (
        <ConfirmDialog title={'Cancel ' + invoiceNumber(order.order_number) + '?'} confirmLabel="Yes, cancel order"
          text={order.refunds.length > 0
            ? 'This order has had a refund, so it cannot be cancelled. Use "Return items" to take everything off it instead.'
            : order.payments.length > 0
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
