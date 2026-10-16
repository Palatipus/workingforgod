import { useState } from 'react'
import { supabase } from '../supabase'
import PasswordInput from '../components/PasswordInput'
import Icon from '../components/Icon'
import { cleanUsername, validUsername, usernameRule } from '../format'
import { errorText } from '../errors'


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
    let loginEmail = username.trim().toLowerCase()
    if (!loginEmail.includes('@')) {
      const { data, error } = await supabase.rpc('email_for_login', { p_username: loginEmail, p_password: password })
      if (error) {
        setError(errorText(error))
        return
      }
      loginEmail = data
    }
    if (!loginEmail) {
      setError('Wrong username or password.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    if (error) setError('Wrong username or password.')
  }

  async function handleSignup() {
    const cleanName = cleanUsername(username)
    if (!validUsername(cleanName)) {
      setError(usernameRule)
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
      setError(errorText(error))
    }
  }

  async function handleForgot() {
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin })
    setNotice('If an account uses that email, a password reset link is on its way.')
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
    forgot: ['Reset password', 'Enter the email you signed up with and we will send a reset link.'],
  }

  const features = [
    { icon: 'box', title: 'Live stock levels', text: 'See what is in stock and what is running low.' },
    { icon: 'receipt', title: 'Orders and invoices', text: 'Create an order and get a PDF invoice in seconds.' },
    { icon: 'users', title: 'One shared record', text: 'Every sale, who made it and when, in one place.' },
  ]

  const inputClass =
    'w-full rounded-full border border-slate-200 bg-slate-50 px-6 py-4 text-base text-[#0F172A] outline-none transition placeholder:text-slate-400 focus:border-[#1f74b0] focus:bg-white focus:ring-4 focus:ring-[#1f74b0]/15'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] lg:p-8">
      <div className="grid w-full overflow-hidden bg-white lg:min-h-[680px] lg:max-w-5xl lg:grid-cols-2 lg:rounded-[32px] lg:shadow-[0_40px_80px_-24px_rgba(15,23,42,0.3),0_16px_32px_-16px_rgba(15,23,42,0.2)]">

        <div className="flex items-center gap-3 bg-gradient-to-r from-[#0b2a4a] to-[#1f74b0] px-6 py-5 lg:hidden">
          <img src="/logo.png" alt="" className="h-11 w-11 rounded-full bg-white p-0.5" />
          <div className="font-bold leading-tight text-white">Working For God Ventures</div>
        </div>

        <div className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-14">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm">
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0F172A] lg:text-4xl">{titles[mode][0]}</h1>
            <p className="mt-2 text-sm text-slate-500">{titles[mode][1]}</p>

            <div className="mt-8 space-y-4">
              {mode === 'signup' && (
                <input className={inputClass} placeholder="Full name" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
              )}

              {mode !== 'forgot' && (
                <input className={inputClass}
                  placeholder={mode === 'signup' ? 'Choose a username' : 'Username or email'}
                  value={username} onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="username" required />
              )}

              {mode !== 'login' && (
                <input className={inputClass} type="email"
                  placeholder={mode === 'signup' ? 'Email (used to reset your password)' : 'Email'} value={email}
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
              className="mt-6 w-full rounded-full bg-[#0b2a4a] py-4 text-base font-semibold text-white shadow-lg shadow-[#0b2a4a]/25 transition hover:bg-[#123a63] disabled:opacity-60">
              {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Request access' : 'Send reset link'}
            </button>

            <div className="mt-6 space-y-2 text-center text-sm text-slate-500">
              {mode === 'login' ? (
                <>
                  <button type="button" onClick={() => switchMode('forgot')} className="block w-full py-1 hover:text-[#0F172A]">
                    Forgot login or password?
                  </button>
                  <button type="button" onClick={() => switchMode('signup')} className="block w-full py-1 hover:text-[#0F172A]">
                    New here? <span className="font-semibold text-[#1f74b0]">Request access</span>
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

        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0b2a4a] via-[#124a7c] to-[#1f74b0] p-12 text-white lg:flex">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-white/10" />
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full border border-white/20" />
          <div className="absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-white/5" />
          <div className="absolute -bottom-16 -left-6 h-60 w-60 rounded-full border border-white/15" />
          <div className="absolute inset-0 opacity-60"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,.14) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              WebkitMaskImage: 'linear-gradient(to bottom right, transparent 30%, black)',
              maskImage: 'linear-gradient(to bottom right, transparent 30%, black)',
            }} />

          <div className="relative">
            <img src="/logo.png" alt="Working For God Ventures" className="h-20 w-20 rounded-full bg-white p-1 shadow-xl shadow-black/20" />
            <h2 className="mt-8 text-4xl font-extrabold leading-tight tracking-tight">
              Working For God<br />Ventures
            </h2>
            <div className="mt-4 flex gap-1.5">
              <span className="h-1.5 w-10 rounded-full bg-[#a3d65c]" />
              <span className="h-1.5 w-6 rounded-full bg-[#e0334c]" />
              <span className="h-1.5 w-3 rounded-full bg-white/70" />
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-blue-100">
              Mindray specialists. Lab equipment, reagents and hands-on training for laboratory teams.
            </p>
          </div>

          <div className="relative space-y-3">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon name={f.icon} size={20} />
                </div>
                <div>
                  <div className="text-sm font-semibold">{f.title}</div>
                  <div className="text-xs text-blue-100">{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
