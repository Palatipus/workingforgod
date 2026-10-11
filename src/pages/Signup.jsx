import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import PasswordInput from '../components/PasswordInput'

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const cleanName = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(cleanName)) {
      setError('Username must be 3-20 characters: letters, numbers or underscore.')
      return
    }

    setBusy(true)

    const { data: taken } = await supabase.rpc('username_taken', { p_username: cleanName })
    if (taken) {
      setError('That username is already taken.')
      setBusy(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName, username: cleanName } },
    })
    if (error) {
      if (error.message.toLowerCase().includes('already')) setError('That email is already registered.')
      else setError(error.message)
    }

    setBusy(false)
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-indigo-600 p-12 text-white lg:flex">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Working For God Ventures" className="h-16 w-16 rounded-full bg-white p-0.5" />
          <div className="text-xl font-bold">Working For God Ventures</div>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Join the team on one shared system.</h2>
          <p className="mt-4 max-w-md text-indigo-100">
            Create your account and an admin will approve it. After that you can add stock, create orders and generate invoices.
          </p>
        </div>
        <div className="text-sm text-indigo-200">Mindray specialists. Lab equipment, reagents and training.</div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <img src="/logo.png" alt="" className="mb-6 h-16 w-16 lg:hidden" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Request access</h1>
          <p className="mt-1 text-sm text-slate-500">An admin will review your request.</p>

          <div className="mt-8 space-y-4">
            <input className="input" placeholder="Full name" value={fullName}
              onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            <input className="input" placeholder="Choose a username" value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="username" required />
            <input className="input" type="email" placeholder="Email (used to reset your password)" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" autoComplete="new-password" />
          </div>

          {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <button disabled={busy} className="btn mt-6 w-full !py-3">
            {busy ? 'Please wait...' : 'Request access'}
          </button>

          <Link to="/" className="mt-4 block w-full py-2 text-center text-sm text-slate-500 hover:text-indigo-600">
            Already have an account? Log in
          </Link>
        </form>
      </div>
    </div>
  )
}
