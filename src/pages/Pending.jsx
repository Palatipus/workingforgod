import { useAuth } from '../AuthContext'

export default function Pending() {
  const { profile, refreshProfile, signOut } = useAuth()
  const rejected = profile && profile.status === 'rejected'

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <img src="/logo.png" alt="" className="mx-auto mb-6 h-16 w-16" />
        <div className={'mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ' +
          (rejected ? 'bg-red-50' : 'bg-amber-50')}>
          {rejected ? '✕' : '⏳'}
        </div>
        <h1 className="mt-6 text-xl font-bold">
          {rejected ? 'No access' : 'Waiting for approval'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {rejected
            ? 'This account does not have access. Please contact your administrator.'
            : 'An admin needs to approve your account before you can get in. Check back shortly.'}
        </p>

        <div className="mt-8 flex justify-center gap-3">
          {!rejected && (
            <button onClick={refreshProfile}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              Check status
            </button>
          )}
          <button onClick={signOut}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
