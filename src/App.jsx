import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Layout from './components/Layout'
import { missingConfig } from './supabase'
import Login from './pages/Login'
import Pending from './pages/Pending'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import NewOrder from './pages/NewOrder'
import Orders from './pages/Orders'

export default function App() {
  const { session, profile, loading, profileReady, recovering } = useAuth()

  if (missingConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-sm">
          <div className="text-lg font-bold text-red-600">Supabase is not configured</div>
          <p className="mt-2 text-slate-600">
            Create a file named <b>.env</b> in the project root with VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY, then stop and restart <b>npm run dev</b>.
          </p>
        </div>
      </div>
    )
  }

  if (loading || (session && !profileReady)) {
    return <div className="flex h-screen items-center justify-center gap-3 text-slate-600"><div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />Loading...</div>
  }

  if (recovering) return <ResetPassword />
  if (!session) return <Login />
  if (!profile || profile.status !== 'approved') return <Pending />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}
