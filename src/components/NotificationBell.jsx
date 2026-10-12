import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

// Where tapping a notification takes you
export function notificationTarget(n, profile) {
  if (n.link) return n.link
  if (n.order_id) return '/orders?order=' + n.order_id
  if (profile.role === 'admin' && n.message.includes('waiting for approval')) return '/team'
  return null
}

export default function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  async function load() {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(15)
    setItems(data || [])
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('notes-' + profile.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + profile.id },
        load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Close when clicking outside or pressing Esc
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = items.filter((n) => !n.is_read).length

  async function openNotification(n) {
    setOpen(false)
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      load()
    }
    const target = notificationTarget(n, profile)
    if (target) navigate(target)
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false)
    load()
  }

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen(!open)} aria-label="Notifications"
        className="relative rounded-full border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-indigo-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.map((n) => (
              <div key={n.id} onClick={() => openNotification(n)}
                className={'cursor-pointer px-4 py-3 text-sm hover:bg-slate-50 ' + (n.is_read ? 'text-slate-400' : 'font-medium')}>
                <div>{n.message}</div>
                <div className="mt-0.5 text-xs font-normal text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
            {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">Nothing yet</div>}
          </div>
          <button onClick={() => { setOpen(false); navigate('/notifications') }}
            className="block w-full border-t border-slate-100 px-4 py-3 text-center text-sm font-medium text-indigo-600 hover:bg-slate-50">
            See all notifications
          </button>
        </div>
      )}
    </div>
  )
}
