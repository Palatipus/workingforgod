import { useState } from 'react'
import { supabase } from '../supabase'
import PasswordInput from '../components/PasswordInput'

async function findEmail(usernameOrEmail) {
  const value = usernameOrEmail.trim()
  if (value.includes('@')) return value.toLowerCase()
  const { data } = await supabase.rpc('email_for_username', { p_username: value })
  return data
}

export default function Login() {
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function handleLogin() {
    const loginEmail = await findEmail(username)
    if (!loginEmail) {
      setError('Wrong username or password.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    if (error) setError('Wrong username or password.')
  }

  async function handleSignup() {
    const cleanName = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(cleanName)) {
      setError('Username must be 3-20 characters: letters, numbers or underscore.')
      return
    }

    const { data: taken } = await supabase.rpc('username_taken', { p_username: cleanName })
    if (taken) {
      setError('That username is already taken.')
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
  }

  async function handleForgot() {
    const resetEmail = await findEmail(username)
    if (resetEmail) {
      await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: window.location.origin })
    }
    setNotice('If that account exists, a password reset link is on its way to its email.')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)

    if (mode === 'login') await handleLogin()
    else if (mode === 'signup') await handleSignup()
    else await handleForgot()

    setBusy(false)
  }

  const titles = {
    login: ['Log in', 'Welcome back. Sign in to manage stock and orders.'],
    signup: ['Request access', 'An admin will review your request.'],
    forgot: ['Reset password', 'Enter your username or email and we will send a reset link.'],
  }

  const inputClass =
    'w-full rounded-full border border-slate-300/80 bg-[#F4F2EC]/90 px-6 py-4 text-base text-[#0F172A] outline-none transition placeholder:text-slate-400 focus:border-[#1E293B] focus:bg-white focus:ring-4 focus:ring-slate-200/70'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFBF9] lg:p-8">
      <div className="relative w-full overflow-hidden bg-gradient-to-br from-white to-[#FAF9F6] lg:min-h-[700px] lg:max-w-6xl lg:rounded-[32px] lg:shadow-[0_40px_80px_-20px_rgba(15,23,42,0.28),0_18px_36px_-18px_rgba(15,23,42,0.22)]">
        <img src="/login-art.jpg" alt=""
          className="absolute inset-0 h-full w-full object-cover lg:left-auto lg:right-0 lg:w-[62%] lg:[-webkit-mask-image:linear-gradient(to_right,transparent,black_24%)] lg:[mask-image:linear-gradient(to_right,transparent,black_24%)]" />

        <div className="relative z-10 flex min-h-screen items-center justify-center p-5 lg:min-h-[700px] lg:w-[42%] lg:p-10">
          <form onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-[32px] border border-white/70 bg-white/55 p-7 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.4)] backdrop-blur-xl lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <img src="/logo.png" alt="Working For God Ventures" className="mx-auto mb-6 h-14 w-14 drop-shadow-md" />
            <h1 className="text-center text-3xl font-bold tracking-tight text-[#0F172A] lg:text-4xl">{titles[mode][0]}</h1>
            <p className="mt-2 text-center text-sm text-slate-500">{titles[mode][1]}</p>

            <div className="mt-8 space-y-4">
              {mode === 'signup' && (
                <input className={inputClass} placeholder="Full name" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
              )}

              <input className={inputClass}
                placeholder={mode === 'signup' ? 'Choose a username' : 'Username or email'}
                value={username} onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="username" required />

              {mode === 'signup' && (
                <input className={inputClass} type="email" placeholder="Email (used to reset your password)" value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              )}

              {mode !== 'forgot' && (
                <PasswordInput inputClass={inputClass} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              )}
            </div>

            {error && <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            {notice && <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

            <button disabled={busy}
              className="mt-6 w-full rounded-full bg-[#1E293B] py-4 text-base font-semibold text-white shadow-lg shadow-slate-900/25 transition hover:bg-[#0F172A] disabled:opacity-60">
              {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Request access' : 'Send reset link'}
            </button>

            <div className="mt-6 space-y-2 text-center text-sm text-slate-500">
              {mode === 'login' ? (
                <>
                  <button type="button" onClick={() => switchMode('forgot')} className="block w-full py-1 hover:text-[#0F172A]">
                    Forgot login or password?
                  </button>
                  <button type="button" onClick={() => switchMode('signup')} className="block w-full py-1 hover:text-[#0F172A]">
                    New here? <span className="font-semibold text-[#1E293B]">Request access</span>
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => switchMode('login')} className="block w-full py-1 hover:text-[#0F172A]">
                  Back to log in
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
