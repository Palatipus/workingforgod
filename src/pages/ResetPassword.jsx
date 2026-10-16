import { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import PasswordInput from '../components/PasswordInput'
import { errorText } from '../errors'

export default function ResetPassword() {
  const { setRecovering } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(errorText(error))
      setBusy(false)
      return
    }
    setRecovering(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <img src="/logo.png" alt="" className="mx-auto mb-5 h-16 w-16" />
        <h1 className="text-center text-xl font-bold">Choose a new password</h1>
        <div className="mt-6">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="New password" autoComplete="new-password" />
        </div>
        {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <button disabled={busy} className="btn mt-6 w-full !py-3">{busy ? 'Saving...' : 'Save password'}</button>
      </form>
    </div>
  )
}
