import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../AuthContext'
import ConfirmDialog from '../../components/ConfirmDialog'
import { money } from '../../format'

// Orders saved without finishing (usually waiting for prices). Their stock is held until finished or deleted.
export default function PendingOrders() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [deleting, setDeleting] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('pending_orders')
      .select('id, created_at, notes, salesperson_id, customers(name), salesperson:profiles!pending_orders_salesperson_id_fkey(full_name), pending_order_items(qty, price, held_qty, name, products(name))')
      .order('created_at')
    if (!error) setRows(data || [])
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('pending-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  if (rows.length === 0) return null

  async function remove() {
    const { error } = await supabase.rpc('delete_pending_order', { p_pending_id: deleting.id })
    if (error) return error.message
    setDeleting(null)
    load()
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
        <div className="font-semibold text-amber-900">Pending orders ({rows.length})</div>
        <div className="text-xs text-amber-800">Saved but not finished, usually waiting for prices. Their items are held out of stock.</div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => {
          const items = row.pending_order_items
          const missing = items.filter((i) => i.price == null).length
          let known = 0
          for (const i of items) if (i.price != null) known += i.qty * Number(i.price)
          const mine = row.salesperson_id === profile.id || profile.role === 'admin'
          const names = items.map((i) => i.qty + ' x ' + (i.products?.name || i.name)).join(', ')
          return (
            <div key={row.id} className="flex flex-col gap-3 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium">
                  {row.customers?.name}
                  {missing > 0 && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {missing} price{missing === 1 ? '' : 's'} needed
                    </span>
                  )}
                </div>
                <div className="truncate text-slate-500">{names}</div>
                <div className="text-xs text-slate-400">
                  {row.salesperson?.full_name} · {new Date(row.created_at).toLocaleString()}
                  {known > 0 && ' · ' + money(known) + (missing > 0 ? ' so far' : '')}
                </div>
                {row.notes && <div className="mt-1 text-xs italic text-slate-500">{row.notes}</div>}
              </div>
              {mine && (
                <div className="flex shrink-0 gap-2">
                  <Link to={'/orders/new?pending=' + row.id} className="btn !py-1.5">Finish</Link>
                  <button onClick={() => setDeleting(row)} className="btn-ghost !py-1.5 text-red-600">Delete</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {deleting && (
        <ConfirmDialog title="Delete pending order" confirmLabel="Delete pending order"
          text={'Delete the pending order for ' + deleting.customers?.name + '? Its held items go back into stock. This cannot be undone.'}
          onClose={() => setDeleting(null)} onConfirm={remove} />
      )}
    </div>
  )
}
