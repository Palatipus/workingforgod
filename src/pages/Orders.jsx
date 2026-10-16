import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, onTableChanges } from '../supabase'
import LoadError from '../components/LoadError'
import DateRange, { applyRange } from '../components/DateRange'
import { money, searchTerm } from '../format'
import OrderDetail from './orders/OrderDetail'
import PendingOrders from './orders/PendingOrders'

const PAGE = 50

const filters = [
  ['all', 'All'],
  ['unpaid', 'Unpaid'],
  ['overdue', 'Overdue'],
  ['pending', 'Pending delivery'],
  ['cancelled', 'Cancelled'],
]

function Badges({ order }) {
  return (
    <>
      {order.is_opening && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">opening balance</span>}
      {order.cancelled_at && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">cancelled</span>}
      {order.has_pending && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">pending</span>}
      {order.overdue && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">overdue</span>}
    </>
  )
}

function balanceText(order) {
  if (order.cancelled_at) return ['-', '']
  const balance = Number(order.balance)
  return balance > 0.005 ? [money(balance), 'text-red-600'] : ['Paid', 'text-emerald-600']
}

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [range, setRange] = useState({ preset: 'all' })
  const [count, setCount] = useState(null)
  const [version, setVersion] = useState(0)
  const selectedId = params.get('order')

  // Wait until typing pauses before searching
  useEffect(() => {
    const t = setTimeout(() => { setQuery(searchTerm(search)); setLimit(PAGE) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let active = true
    setLoading(true)
    let q = supabase.from('order_list').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(0, limit)
    q = applyRange(q, range)
    if (query) q = q.or('invoice_number.ilike.%' + query + '%,customer_name.ilike.%' + query + '%,salesperson.ilike.%' + query + '%')
    if (filter === 'unpaid') q = q.is('cancelled_at', null).gt('balance', 0.005)
    if (filter === 'overdue') q = q.eq('overdue', true)
    if (filter === 'pending') q = q.eq('has_pending', true)
    if (filter === 'cancelled') q = q.not('cancelled_at', 'is', null)
    q.then(({ data, error, count }) => {
      if (!active) return
      setLoadFailed(!!error)
      const list = data || []
      setHasMore(list.length > limit)
      setCount(error ? null : count)
      setRows(list.slice(0, limit))
      setLoading(false)
    })
    return () => { active = false }
  }, [query, filter, limit, version, range])

  useEffect(() => {
    return onTableChanges('orders-live', ['orders', 'order_items', 'payments', 'refunds'], () => setVersion((v) => v + 1))
  }, [])

  function openOrder(id) {
    setParams(id ? { order: id } : {})
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">Everything sold by the team: who, to whom, when and what is still owed.</p>
      </div>

      <PendingOrders />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input className="input md:max-w-xs" placeholder="Search by invoice, customer or salesperson" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <DateRange value={range} onChange={(r) => { setRange(r); setLimit(PAGE) }} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(([key, label]) => (
            <button key={key} onClick={() => { setFilter(key); setLimit(PAGE) }}
              className={'shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ' +
                (filter === key ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Phones: one card per order */}
      <div className="card divide-y divide-slate-100 md:hidden">
        {rows.map((order) => {
          const [balance, balanceCls] = balanceText(order)
          return (
            <button key={order.id} onClick={() => openOrder(order.id)}
              className={'block w-full px-4 py-3 text-left text-sm ' + (order.cancelled_at ? 'text-slate-400' : order.has_pending ? 'bg-red-50/50' : '')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium"><span className={order.cancelled_at ? 'line-through' : ''}>{order.invoice_number}</span><Badges order={order} /></div>
                  <div className="truncate">{order.customer_name}</div>
                  <div className="text-xs text-slate-400">{new Date(order.created_at).toLocaleDateString()} · {order.salesperson}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{order.cancelled_at ? '-' : money(order.total)}</div>
                  <div className={'text-xs font-semibold ' + balanceCls}>{balance === 'Paid' || balance === '-' ? balance : 'owes ' + balance}</div>
                </div>
              </div>
            </button>
          )
        })}
        {!loading && !loadFailed && rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">No orders found</div>}
      </div>

      {/* Bigger screens: table */}
      <div className="hidden overflow-x-auto card md:block">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-3">Invoice</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Salesperson</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => {
              const cancelled = !!order.cancelled_at
              return (
                <tr key={order.id} onClick={() => openOrder(order.id)}
                  className={'cursor-pointer border-t border-slate-100 hover:bg-slate-50 ' +
                    (cancelled ? 'text-slate-400' : order.has_pending ? 'bg-red-50/50' : '')}>
                  <td className="px-5 py-3 font-medium">
                    <span className={cancelled ? 'line-through' : ''}>{order.invoice_number}</span>
                    <Badges order={order} />
                  </td>
                  <td className="px-5 py-3">{order.customer_name}</td>
                  <td className="px-5 py-3 text-slate-500">{order.salesperson}</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right font-semibold">{cancelled ? '-' : money(order.total)}</td>
                  <td className={'px-5 py-3 text-right font-semibold ' + balanceText(order)[1]}>{balanceText(order)[0]}</td>
                </tr>
              )
            })}
            {!loading && !loadFailed && rows.length === 0 && (
              <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-400">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {count !== null && !loadFailed && (
        <p className="-mt-3 text-sm text-slate-500">{count} order{count === 1 ? '' : 's'}{rows.length < count ? ', showing ' + rows.length : ''}</p>
      )}

      {loadFailed && <LoadError onRetry={() => setVersion((v) => v + 1)} />}

      {hasMore && (
        <div className="flex justify-center">
          <button disabled={loading} onClick={() => setLimit(limit + PAGE)} className="btn-ghost">
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {selectedId && (
        <OrderDetail orderId={selectedId} version={version} onClose={() => openOrder(null)}
          onChanged={() => setVersion((v) => v + 1)} />
      )}
    </div>
  )
}
