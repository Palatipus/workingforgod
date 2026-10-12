import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import NotificationBell from './NotificationBell'
import Icon from './Icon'
import UsernameDialog from './UsernameDialog'
import { useInstallPrompt } from '../install'

const links = [
  { to: '/', label: 'Dashboard', icon: 'home' },
  { to: '/orders', label: 'Orders', icon: 'receipt' },
  { to: '/orders/new', label: 'New order', icon: 'plus' },
  { to: '/inventory', label: 'Inventory', icon: 'box' },
  { to: '/customers', label: 'Customers', icon: 'users' },
]

export default function Layout() {
  const { profile, signOut, refreshProfile } = useAuth()
  // Ask people without a username to pick one (accounts made before usernames existed)
  const [usernameOpen, setUsernameOpen] = useState(!profile.username)
  const { available: canInstall, install } = useInstallPrompt()
  const isAdmin = profile.role === 'admin'
  const sideLinks = isAdmin ? [...links, { to: '/team', label: 'Team', icon: 'team' }] : links

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
          {sideLinks.map((link) => (
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
          <button onClick={() => setUsernameOpen(true)} className="block text-xs text-slate-400 hover:text-indigo-600">
            {profile.username ? '@' + profile.username : 'Set a username'} · <span className="capitalize">{profile.role}</span>
          </button>
          <button onClick={signOut} className="mt-2 text-xs font-medium text-red-500 hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
        <div className="mb-4 flex items-center justify-between md:mb-6 md:justify-end">
          <button onClick={() => setUsernameOpen(true)} className="flex items-center gap-2 text-left md:hidden">
            <img src="/logo.png" alt="" className="h-9 w-9" />
            <span>
              <span className="block text-sm font-bold leading-tight text-indigo-800">Working For God</span>
              <span className="block text-xs text-slate-400">{profile.username ? '@' + profile.username : 'Set a username'}</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            {canInstall && (
              <button onClick={install}
                className="rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                Install app
              </button>
            )}
            {isAdmin && (
              <Link to="/team" className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 md:hidden">
                Team
              </Link>
            )}
            <NotificationBell />
            <button onClick={signOut}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 md:hidden">
              Sign out
            </button>
          </div>
        </div>
        <Outlet />
      </main>

      {usernameOpen && (
        <UsernameDialog current={profile.username}
          title={profile.username ? 'Change your username' : 'Choose a username'}
          intro={profile.username ? 'You log in with this.' : 'Pick a username so you can log in with it instead of your email.'}
          onClose={() => setUsernameOpen(false)}
          onSaved={async () => { await refreshProfile(); setUsernameOpen(false) }} />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
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
