import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import LoadError from '../components/LoadError'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase, selectAll } from '../supabase'
import { useAuth } from '../AuthContext'
import { money as formatMoney } from '../format'
import { errorText } from '../errors'

const money = (n) => formatMoney(n, 0)

function percentChange(now, before) {
  if (!before) return null
  return Math.round(((now - before) / before) * 100)
}

const tones = {
  blue: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
}

function EmptyState({ icon, title, text, actionLabel, actionTo, big, compact }) {
  const padding = big ? 'py-14' : compact ? 'px-5 py-8' : 'px-5 py-10'
  return (
    <div className={'flex flex-col items-center justify-center text-center ' + padding}>
      <div className={'flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ' + (big ? 'h-16 w-16' : 'h-12 w-12')}>
        <Icon name={icon} size={big ? 30 : 22} />
      </div>
      <div className="mt-4 text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 max-w-xs text-sm text-slate-500">{text}</div>
      {actionTo && (
        <Link to={actionTo} className="btn mt-5 inline-block !px-6 !py-2.5">{actionLabel}</Link>
      )}
    </div>
  )
}

function StatCard({ label, value, change, alert, icon, tone, note, to }) {
  const hasChange = change !== undefined && change !== null
  // A card with `to` opens that list when tapped
  const Box = to ? Link : 'div'
  return (
    <Box to={to} className={'card block p-5' + (to ? ' transition hover:border-indigo-200 hover:shadow-md' : '')}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        <div className={'flex h-9 w-9 items-center justify-center rounded-lg ' + tones[tone]}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div className={'mt-3 text-2xl font-bold tracking-tight md:text-3xl ' + (alert ? 'text-red-600' : 'text-slate-900')}>
        {value}
      </div>
      {hasChange ? (
        <div className={'mt-1 text-xs font-medium ' + (change >= 0 ? 'text-emerald-600' : 'text-red-600')}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change)}% vs last month
        </div>
      ) : (
        <div className="mt-1 text-xs text-slate-400">{note}</div>
      )}
    </Box>
  )
}

function RecentOrders({ title = 'Recent orders' }) {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [failed, setFailed] = useState(false)

  function load() {
    setFailed(false)
    supabase
      .from('order_list')
      .select('id, invoice_number, created_at, customer_name, salesperson, total, has_pending, overdue')
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (error) setFailed(true)
        else setOrders(data || [])
      })
  }

  useEffect(() => { load() }, [])

  if (failed) return <LoadError onRetry={load} />

  return (
    <div className="card">
      <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">{title}</div>
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="px-5 py-3">Invoice</th>
            <th className="px-5 py-3">Customer</th>
            <th className="px-5 py-3">Salesperson</th>
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            return (
              <tr key={order.id} onClick={() => navigate('/orders?order=' + order.id)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">
                  {order.invoice_number}
                  {order.overdue && (
                    <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">overdue</span>
                  )}
                  {order.has_pending && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                      pending
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">{order.customer_name}</td>
                <td className="px-5 py-3 text-slate-500">{order.salesperson}</td>
                <td className="px-5 py-3 text-slate-500">{new Date(order.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-right font-semibold">{money(order.total)}</td>
              </tr>
            )
          })}
          {orders.length === 0 && (
            <tr><td colSpan="5"><EmptyState compact icon="receipt" title="No orders yet" text="Orders created by your team will show up here." /></td></tr>
          )}
        </tbody>
      </table></div>
    </div>
  )
}

function PendingSignups({ onChanged }) {
  const [people, setPeople] = useState([])
  const [confirming, setConfirming] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('profiles').select('id, full_name, username, created_at').eq('status', 'pending')
    if (!error) setPeople(data || [])
  }

  useEffect(() => { load() }, [])

  async function confirmDecision() {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('set_user_status', { p_user: confirming.person.id, p_status: confirming.action })
    setBusy(false)
    if (error) {
      setError(errorText(error))
      return
    }
    setConfirming(null)
    await load()
    onChanged()
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <span className="text-sm font-semibold text-slate-900">Pending signups</span>
        <Link to="/team" className="text-xs font-medium text-indigo-600 hover:underline">Manage team</Link>
      </div>
      <div className="divide-y divide-slate-100">
        {people.map((person) => (
          <div key={person.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <div className="text-sm font-medium">{person.full_name}</div>
              <div className="text-xs text-slate-400">{person.username ? '@' + person.username + ' · ' : ''}{new Date(person.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirming({ person, action: 'approved' })}
                className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                Approve
              </button>
              <button onClick={() => setConfirming({ person, action: 'rejected' })}
                className="rounded-md bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">
                Reject
              </button>
            </div>
          </div>
        ))}
        {people.length === 0 && <EmptyState compact icon="check" title="All caught up" text="New signups waiting for approval will show here." />}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">
              {confirming.action === 'approved' ? 'Approve' : 'Reject'} {confirming.person.full_name}?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {confirming.action === 'approved'
                ? 'They will get full access as a salesperson.'
                : 'They will not be able to use the system.'}
            </p>
            {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setConfirming(null); setError('') }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600">
                Cancel
              </button>
              <button onClick={confirmDecision} disabled={busy}
                className={'rounded-lg px-4 py-2 text-sm font-semibold text-white ' +
                  (confirming.action === 'approved' ? 'bg-emerald-600' : 'bg-red-600')}>
                Yes, {confirming.action === 'approved' ? 'approve' : 'reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TopList({ title, rows, nameKey, icon, emptyText }) {
  return (
    <div className="card">
      <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">{title}</div>
      {rows.length === 0 ? (
        <EmptyState compact icon={icon} title="No sales yet" text={emptyText} />
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <div key={row[nameKey]} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-slate-900">{row[nameKey]}</span>
              <span className="font-semibold text-slate-900">{money(row.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [days, setDays] = useState(30)
  const [chart, setChart] = useState([])
  const [products, setProducts] = useState([])
  const [people, setPeople] = useState([])

  const [offline, setOffline] = useState(false)

  async function loadStats() {
    setOffline(false)
    setLoadError('')
    const { data, error } = await supabase.rpc('dashboard_stats')
    // No error code means the request never reached the server (connection problem)
    if (error && !error.code) setOffline(true)
    else if (error) setLoadError(errorText(error))
    else setStats(data)
  }

  function loadAll() {
    loadStats()
    supabase.rpc('top_products').then(({ data }) => setProducts(data || []))
    supabase.rpc('top_salespeople').then(({ data }) => setPeople(data || []))
  }

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    supabase.rpc('sales_by_day', { p_days: days }).then(({ data }) => {
      setChart((data || []).map((row) => ({ day: row.day.slice(5), total: Number(row.total) })))
    })
  }, [days])

  if (offline) return <LoadError onRetry={loadAll} />

  if (loadError) {
    return (
      <div className="card max-w-lg p-6 text-sm">
        <div className="font-semibold text-red-600">The dashboard could not load</div>
        <p className="mt-2 text-slate-600">{loadError}</p>
        <p className="mt-2 text-slate-400">Check that every SQL file (schema.sql, then schema_update.sql to schema_update_12.sql) ran and that this account is an admin.</p>
      </div>
    )
  }

  if (!stats) return <div className="text-slate-500">Loading...</div>

  const noSales = chart.length > 0 && chart.every((d) => d.total === 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500">Stock, orders and sales at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/reports" className="btn-ghost">Reports and exports</Link>
          <Link to="/settings" className="btn-ghost">Settings</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        <StatCard label="Revenue this month" icon="revenue" tone="blue" note="No sales last month"
          value={money(stats.revenue_this_month)}
          change={percentChange(stats.revenue_this_month, stats.revenue_last_month)} />
        <StatCard label="Cash collected this month" icon="check" tone="emerald" note="No payments last month"
          value={money(stats.cash_this_month)}
          change={percentChange(stats.cash_this_month, stats.cash_last_month)} />
        <StatCard label="Orders this month" icon="receipt" tone="blue" note="Orders created"
          value={stats.orders_this_month} />
        <StatCard label="Pending deliveries" icon="truck" tone="red" note="Items still owed" to="/inventory?filter=owed"
          value={stats.pending_deliveries} alert={stats.pending_deliveries > 0} />
        <StatCard label="Low / out of stock" icon="box" tone="amber" note="Products to restock" to="/inventory?filter=low"
          value={stats.low_stock_count + stats.out_of_stock_count} alert={stats.out_of_stock_count > 0} />
        <StatCard label="Owed by customers" icon="users" tone="red"
          note={(stats.customers_owing || 0) + ' customer' + (stats.customers_owing === 1 ? '' : 's') + ' owing' +
            (stats.customer_credit > 0 ? ' · ' + money(stats.customer_credit) + ' credit held' : '') +
            (stats.overdue_amount > 0 ? ' · ' + money(stats.overdue_amount) + ' overdue' : '')}
          value={money(stats.outstanding_debt)} alert={stats.outstanding_debt > 0} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Sales</div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {[7, 30, 90].map((n) => (
                <button key={n} onClick={() => setDays(n)}
                  className={'rounded-md px-3 py-1 text-xs font-medium ' +
                    (days === n ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}>
                  {n}d
                </button>
              ))}
            </div>
          </div>
          {noSales ? (
            <EmptyState big icon="chart" title="No sales recorded yet" text="Start creating your first order!"
              actionLabel="Create New Order" actionTo="/orders/new" />
          ) : (
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1f74b0" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1f74b0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => money(value)} />
                <Area type="monotone" dataKey="total" stroke="#1f74b0" strokeWidth={2} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        <PendingSignups onChanged={loadStats} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopList title="Top products" rows={products} nameKey="product_name" icon="box"
          emptyText="Your best-selling products will appear here once orders come in." />
        <TopList title="Top salespeople" rows={people} nameKey="salesperson" icon="users"
          emptyText="Salesperson rankings will appear here after the first sale." />
      </div>

      <RecentOrders />
    </div>
  )
}

function MyCustomersOwing({ userId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  function load() {
    setFailed(false)
    selectAll(() => supabase.from('order_list')
      .select('id, invoice_number, customer_id, customer_name, balance, due_date, overdue, created_at')
      .eq('salesperson_id', userId).is('cancelled_at', null).gt('balance', 0.005)
      .order('created_at').order('id'))
      .then(({ data, error }) => {
        if (error) setFailed(true)
        else setRows(data || [])
      })
  }

  useEffect(() => { load() }, [userId])

  if (failed) return <LoadError onRetry={load} />
  if (!rows) return null

  // Group the unpaid invoices by customer
  const byCustomer = {}
  for (const r of rows) {
    const c = byCustomer[r.customer_id] || (byCustomer[r.customer_id] = { name: r.customer_name, owed: 0, overdue: 0, orders: [] })
    c.owed += Number(r.balance)
    if (r.overdue) c.overdue += Number(r.balance)
    c.orders.push(r)
  }
  const customers = Object.values(byCustomer).sort((a, b) => b.overdue - a.overdue || b.owed - a.owed)

  return (
    <div className="card">
      <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">My customers who owe</div>
      {customers.length === 0 ? (
        <EmptyState compact icon="check" title="Nobody owes on your orders" text="Unpaid invoices from your sales will show here." />
      ) : (
        <div className="divide-y divide-slate-100">
          {customers.map((c) => (
            <div key={c.name + c.orders[0].id} className="px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{c.name}</span>
                <span className="text-right">
                  <span className="font-semibold text-red-600">{money(c.owed)}</span>
                  {c.overdue > 0 && <span className="block text-xs font-semibold text-red-600">{money(c.overdue)} overdue</span>}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {c.orders.map((o) => (
                  <button key={o.id} onClick={() => navigate('/orders?order=' + o.id)}
                    className={'rounded-full px-2 py-0.5 text-xs font-medium ' +
                      (o.overdue ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                    {o.invoice_number}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SalespersonDashboard({ profile }) {
  const [stats, setStats] = useState(null)
  const [failed, setFailed] = useState(false)

  function load() {
    setFailed(false)
    supabase.rpc('my_stats').then(({ data, error }) => {
      if (error) setFailed(true)
      else setStats(data)
    })
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hi, {profile.full_name.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500">Your sales this month and what your customers still owe.</p>
        </div>
        <Link to="/orders/new" className="btn">+ New order</Link>
      </div>

      {failed && <LoadError onRetry={load} />}

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard label="My sales this month" icon="revenue" tone="blue" note="No sales last month"
            value={money(stats.sales_this_month)}
            change={percentChange(stats.sales_this_month, stats.sales_last_month)} />
          <StatCard label="Cash I collected" icon="check" tone="emerald" note="Payments recorded this month"
            value={money(stats.cash_this_month)} />
          <StatCard label="Owed on my orders" icon="users" tone="red"
            note={stats.overdue_on_my_orders > 0 ? money(stats.overdue_on_my_orders) + ' overdue' : stats.orders_this_month + ' orders this month'}
            value={money(stats.owed_on_my_orders)} alert={stats.overdue_on_my_orders > 0} />
          <StatCard label="Still to deliver" icon="truck" tone="amber" note="Items owed on my orders"
            value={stats.pending_on_my_orders} alert={stats.pending_on_my_orders > 0} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MyCustomersOwing userId={profile.id} />
        <RecentOrders title="Latest orders from the team" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  if (profile.role === 'admin') return <AdminDashboard />
  return <SalespersonDashboard profile={profile} />
}
