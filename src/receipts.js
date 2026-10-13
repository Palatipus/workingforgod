import { supabase } from './supabase'
import { receiptNumber, refundNumber } from './format'
import { invoiceNumber } from './invoice'

// Loads everything needed to print a receipt
export async function fetchReceipt(id) {
  const { data, error } = await supabase
    .from('receipts')
    .select('id, receipt_number, created_at, amount, method, note, balance_after, credit_after, reversed_at, reversed_lines, customers(name, phone, location), receiver:profiles!receipts_created_by_fkey(full_name), payments(amount, orders(order_number))')
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    receiptNumber: receiptNumber(data.receipt_number),
    date: data.created_at,
    customer: data.customers,
    amount: Number(data.amount),
    method: data.method,
    note: data.note,
    receivedBy: data.receiver?.full_name || '',
    balanceAfter: data.balance_after === null ? null : Number(data.balance_after),
    creditAfter: data.credit_after === null ? 0 : Number(data.credit_after),
    reversed: !!data.reversed_at,
    // A reversed receipt's payments are gone; its breakdown was saved in reversed_lines
    allocations: (data.reversed_at
      ? (data.reversed_lines || []).map((l) => ({ invoiceNumber: invoiceNumber(l.order_number), amount: Number(l.amount), n: l.order_number }))
      : (data.payments || []).map((p) => ({ invoiceNumber: invoiceNumber(p.orders.order_number), amount: Number(p.amount), n: p.orders.order_number }))
    ).sort((a, b) => a.n - b.n),
  }
}

// Loads everything needed to print a refund note
export async function fetchRefund(id) {
  const { data, error } = await supabase
    .from('refunds')
    .select('id, refund_number, created_at, amount, method, note, order_id, profiles(full_name), orders(order_number, customer_name, customer_phone, customer_location, customers(name, phone, location))')
    .eq('id', id)
    .single()
  if (error) throw error

  // Returns saved in the same transaction as the refund share its timestamp
  const { data: returns } = await supabase.from('order_returns')
    .select('owed_removed, returned, order_items(product_name, products(name))')
    .eq('order_id', data.order_id).eq('created_at', data.created_at)

  const o = data.orders
  return {
    refundNumber: refundNumber(data.refund_number),
    date: data.created_at,
    customer: {
      name: o.customer_name || o.customers?.name,
      phone: o.customer_name ? o.customer_phone : o.customers?.phone,
      location: o.customer_name ? o.customer_location : o.customers?.location,
    },
    amount: Number(data.amount),
    method: data.method,
    note: data.note,
    invoiceNumber: invoiceNumber(o.order_number),
    by: data.profiles?.full_name || '',
    items: (returns || []).map((r) => ({
      name: r.order_items?.product_name || r.order_items?.products?.name,
      qty: r.owed_removed + r.returned,
    })),
  }
}
