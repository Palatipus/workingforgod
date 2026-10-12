import { supabase } from './supabase'
import { receiptNumber } from './format'
import { invoiceNumber } from './invoice'

// Loads everything needed to print a receipt
export async function fetchReceipt(id) {
  const { data, error } = await supabase
    .from('receipts')
    .select('id, receipt_number, created_at, amount, method, note, balance_after, reversed_at, customers(name, phone, location), receiver:profiles!receipts_created_by_fkey(full_name), payments(amount, orders(order_number))')
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
    reversed: !!data.reversed_at,
    allocations: (data.payments || [])
      .map((p) => ({ invoiceNumber: invoiceNumber(p.orders.order_number), amount: Number(p.amount), n: p.orders.order_number }))
      .sort((a, b) => a.n - b.n),
  }
}
