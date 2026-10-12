import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from '../components/Modal'
import UsernameDialog from '../components/UsernameDialog'
import LoadError from '../components/LoadError'

const statusBadge = {
  approved: ['Active', 'bg-emerald-50 text-emerald-700'],
  pending: ['Waiting for approval', 'bg-amber-50 text-amber-700'],
  rejected: ['No access', 'bg-slate-100 text-slate-500'],
}

// What each action does, for the confirmation dialog
const actions = {
  approve: { label: 'Approve', rpc: 'set_user_status', args: { p_status: 'approved' }, text: 'They will get access as a salesperson.', tone: 'emerald' },
  reject: { label: 'Reject', rpc: 'set_user_status', args: { p_status: 'rejected' }, text: 'They will not be able to use the system.', tone: 'red' },
  remove: { label: 'Remove access for', rpc: 'set_user_status', args: { p_status: 'rejected' }, text: 'They lose access straight away. Their past orders stay.', tone: 'red' },
  restore: { label: 'Restore access for', rpc: 'set_user_status', args: { p_status: 'approved' }, text: 'They will be able to sign in again with their old role.', tone: 'emerald' },
  makeAdmin: { label: 'Make admin:', rpc: 'set_user_role', args: { p_role: 'admin' }, text: 'Admins see sales figures, manage the team, cancel orders and reverse payments.', tone: 'indigo' },
  makeSales: { label: 'Make salesperson:', rpc: 'set_user_role', args: { p_role: 'salesperson' }, text: 'They lose admin rights but keep access.', tone: 'indigo' },
}

const toneCls = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  red: 'bg-red-600 hover:bg-red-700',
  indigo: 'bg-indigo-600 hover:bg-indigo-700',
}

function ActionButton({ children, onClick, danger }) {
  return (
    <button onClick={onClick}
      className={'rounded-md px-3 py-1 text-xs font-semibold ' +
        (danger ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
      {children}
    </button>
  )
}

export default function Team() {
  const { profile } = useAuth()
  const [people, setPeople] = useState([])
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('profiles').select('id, full_name, username, role, status, created_at').order('full_name')
    setLoadFailed(!!error)
    if (!error) setPeople(data || [])
  }

  useEffect(() => { load() }, [])

  async function confirm() {
    const action = actions[confirming.action]
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc(action.rpc, { p_user: confirming.person.id, ...action.args })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setConfirming(null)
    load()
  }

  const order = { pending: 0, approved: 1, rejected: 2 }
  const sorted = [...people].sort((a, b) => order[a.status] - order[b.status])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
        <p className="text-sm text-slate-500">Approve new people, remove people who have left and choose who is an admin.</p>
      </div>

      {loadFailed && <LoadError onRetry={load} />}

      <div className="overflow-x-auto card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Joined</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((person) => {
              const me = person.id === profile.id
              const [badge, badgeCls] = statusBadge[person.status]
              const act = (action) => () => { setError(''); setConfirming({ person, action }) }
              return (
                <tr key={person.id} className="border-t border-slate-100">
                  <td className="px-5 py-3">
                    <div className="font-medium">{person.full_name}{me && <span className="ml-2 text-xs text-slate-400">(you)</span>}</div>
                    <button onClick={() => setRenaming(person)} className="text-xs text-slate-400 hover:text-indigo-600">
                      {person.username ? '@' + person.username : <span className="text-amber-600">No username, set one</span>}
                    </button>
                  </td>
                  <td className="px-5 py-3 capitalize">{person.role}</td>
                  <td className="px-5 py-3">
                    <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + badgeCls}>{badge}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{new Date(person.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    {!me && (
                      <div className="flex justify-end gap-2">
                        {person.status === 'pending' && (
                          <>
                            <ActionButton onClick={act('approve')}>Approve</ActionButton>
                            <ActionButton danger onClick={act('reject')}>Reject</ActionButton>
                          </>
                        )}
                        {person.status === 'approved' && (
                          <>
                            {person.role === 'admin'
                              ? <ActionButton onClick={act('makeSales')}>Make salesperson</ActionButton>
                              : <ActionButton onClick={act('makeAdmin')}>Make admin</ActionButton>}
                            <ActionButton danger onClick={act('remove')}>Remove access</ActionButton>
                          </>
                        )}
                        {person.status === 'rejected' && (
                          <ActionButton onClick={act('restore')}>Restore access</ActionButton>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {renaming && (
        <UsernameDialog person={renaming.id === profile.id ? null : renaming} current={renaming.username}
          title={'Username for ' + renaming.full_name}
          intro={renaming.id === profile.id ? 'You log in with this.' : 'Tell them their new username. Their password does not change.'}
          onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); load() }} />
      )}

      {confirming && (
        <Modal title={actions[confirming.action].label + ' ' + confirming.person.full_name + '?'} onClose={() => setConfirming(null)}>
          <p className="text-sm text-slate-600">{actions[confirming.action].text}</p>
          {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setConfirming(null)} className="btn-ghost">Cancel</button>
            <button disabled={busy} onClick={confirm}
              className={'rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ' + toneCls[actions[confirming.action].tone]}>
              {busy ? 'Saving...' : 'Yes, continue'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
