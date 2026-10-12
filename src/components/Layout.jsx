import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import NotificationBell from './NotificationBell'
import Icon from './Icon'

const links = [
  { to: '/', label: 'Dashboard', icon: 'home' },
  { to: '/orders', label: 'Orders', icon: 'receipt' },
  { to: '/orders/new', label: 'New order', icon: 'plus' },
  { to: '/inventory', label: 'Inventory', icon: 'box' },
  { to: '/customers', label: 'Customers', icon: 'users' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex">
        <div className="flex items-center gap-3 px-2">
          <img src="/logo.png" alt="Working For God Ventures" className="h-11 w-11" />
          <div>
            <div className="text-sm font-bold leading-tight text-indigo-800">Working For God</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ventures</div>
          </div>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ' +
                (isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
              }
            >
              <Icon name={link.icon} size={18} />
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="truncate text-sm font-semibold">{profile.full_name}</div>
          <div className="text-xs capitalize text-slate-400">{profile.role}</div>
          <button onClick={signOut} className="mt-2 text-xs font-medium text-red-500 hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <div className="mb-4 flex items-center justify-between md:mb-6 md:justify-end">
          <div className="flex items-center gap-2 md:hidden">
            <img src="/logo.png" alt="" className="h-9 w-9" />
            <span className="text-sm font-bold text-indigo-800">Working For God</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={signOut}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 md:hidden">
              Sign out
            </button>
          </div>
        </div>
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.to === '/'}
            className={({ isActive }) =>
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ' + (isActive ? 'text-indigo-600' : 'text-slate-500')}>
            <Icon name={link.icon} size={20} />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
