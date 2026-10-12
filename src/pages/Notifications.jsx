import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import LoadError from '../components/LoadError'
import { notificationTarget } from '../components/NotificationBell'

const PAGE = 50

export default function Notifications() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).range(0, limit)
    if (onlyUnread) q = q.eq('is_read', false)
    const { data, error } = await q
    setLoading(false)
    setFailed(!!error)
    if (error) return
    setHasMore(data.length > limit)
    setItems(data.slice(0, limit))
  }

  useEffect(() => { load() }, [limit, onlyUnread])

  async function open(n) {
    if (!n.is_read) await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    const target = notificationTarget(n, profile)
    if (target) navigate(target)
    else load()
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false)
    load()
  }

  const unread = items.filter((n) => !n.is_read).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">Everything the app has told you, newest first.</p>
        </div>
        {unread > 0 && <button onClick={markAllRead} className="btn-ghost">Mark all read</button>}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyUnread} onChange={(e) => { setOnlyUnread(e.target.checked); setLimit(PAGE) }} />
        Only unread
      </label>

      {failed && <LoadError onRetry={load} />}

      <div className="card divide-y divide-slate-100">
        {items.map((n) => (
          <button key={n.id} onClick={() => open(n)}
            className={'block w-full px-5 py-4 text-left text-sm hover:bg-slate-50 ' + (n.is_read ? 'text-slate-500' : 'font-medium text-slate-900')}>
            <div className="flex items-start gap-3">
              <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (n.is_read ? 'bg-transparent' : 'bg-indigo-600')} />
              <span>
                {n.message}
                <span className="mt-0.5 block text-xs font-normal text-slate-400">{new Date(n.created_at).toLocaleString()}</span>
              </span>
            </div>
          </button>
        ))}
        {!loading && !failed && items.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-slate-400">{onlyUnread ? 'No unread notifications' : 'Nothing yet'}</div>
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button disabled={loading} onClick={() => setLimit(limit + PAGE)} className="btn-ghost">{loading ? 'Loading...' : 'Load more'}</button>
        </div>
      )}
    </div>
  )
}
