import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Modal from '../components/Modal'
import { money } from '../format'
import { downloadInvoice } from '../invoice'

function orderTotal(order) {
  let total = 0
  for (const item of order.order_items) total += item.qty * item.price
  return total
}

function hasPending(order) {
  return order.order_items.some((item) => item.pending_qty > 0)
}

function OrderDetail({ order, onClose, onDelivered }) {
  async function markDelivered(itemId) {
    if (!window.confirm('Mark this item as delivered?')) return
    await supabase.rpc('mark_delivered', { p_item_id: itemId })
    onDelivered()
  }

  function invoice() {
    downloadInvoice({
      orderNumber: order.order_number,
      date: order.created_at,
      customer: order.customers,
      salesperson: order.profiles?.full_name || '',
      items: order.order_items.map((item) => ({
        name: item.products.name,
        qty: item.qty,
        price: item.price,
        pending_qty: item.pending_qty,
      })),
    })
  }

  return (
    <Modal title={'Order #' + order.order_number} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-400">Customer</div>
          <div className="font-semibold">{order.customers?.name}</div>
          <div className="text-slate-500">{order.customers?.phone}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Sold by</div>
          <div className="font-semibold">{order.profiles?.full_name}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Date</div>
          <div className="font-semibold">{new Date(order.created_at).toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr><th className="py-2">Item</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th><th className="py-2"></th></tr>
        </thead>
        <tbody>
          {order.order_items.map((item) => {
            const pending = item.pending_qty > 0
            return (
              <tr key={item.id} className={'border-t border-slate-100 ' + (pending ? 'bg-red-50 text-red-700' : '')}>
                <td className="py-3 font-medium">{item.products.name}</td>
                <td className="py-3 text-center">{item.qty}</td>
                <td className="py-3 text-right">{money(item.price)}</td>
                <td className="py-3 text-right font-semibold">{money(item.qty * item.price)}</td>
                <td className="py-3 text-right">
                  {pending && (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs font-semibold">{item.pending_qty} owed</span>
                      <button onClick={() => markDelivered(item.id)}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">
                        Mark delivered
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
      </table></div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
        <button onClick={invoice} className="btn-ghost">Download invoice</button>
        <div className="text-xl font-bold">{money(orderTotal(order))}</div>
      </div>
    </Modal>
  )
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, created_at, customers(name, phone, location), profiles(full_name), order_items(id, qty, price, pending_qty, delivered_at, products(name))')
      .order('created_at', { ascending: false })
    setOrders(data || [])
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const shown = orders.filter((o) => {
    const text = ('#' + o.order_number + ' ' + (o.customers?.name || '') + ' ' + (o.profiles?.full_name || '')).toLowerCase()
    if (!text.includes(search.toLowerCase())) return false
    if (onlyPending && !hasPending(o)) return false
    return true
  })

  const selected = orders.find((o) => o.id === selectedId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">Everything sold by the team: who, to whom and when.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <input className="input md:max-w-sm" placeholder="Search by order, customer or salesperson" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          Only orders with pending deliveries
        </label>
      </div>

      <div className="overflow-x-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Salesperson</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((order) => (
              <tr key={order.id} onClick={() => setSelectedId(order.id)}
                className={'cursor-pointer border-t border-slate-100 hover:bg-slate-50 ' + (hasPending(order) ? 'bg-red-50/50' : '')}>
                <td className="px-5 py-3 font-medium">
                  #{order.order_number}
                  {hasPending(order) && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">pending</span>
                  )}
                </td>
                <td className="px-5 py-3">{order.customers?.name}</td>
                <td className="px-5 py-3 text-slate-500">{order.profiles?.full_name}</td>
                <td className="px-5 py-3 text-slate-500">{new Date(order.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-right font-semibold">{money(orderTotal(order))}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-400">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <OrderDetail order={selected} onClose={() => setSelectedId(null)} onDelivered={load} />}
    </div>
  )
}
