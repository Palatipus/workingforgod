import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileReady, setProfileReady] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const lastUserId = useRef(null)

  async function loadProfile(userId) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(data)
    } catch (err) {
      setProfile(null)
    }
  }

  useEffect(() => {
    let active = true
    const fallback = setTimeout(() => {
      if (active) {
        setLoading(false)
        setProfileReady(true)
      }
    }, 6000)

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!active) return
        setSession(data.session)
        if (data.session) {
          lastUserId.current = data.session.user.id
          await loadProfile(data.session.user.id)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setProfileReady(true)
          setLoading(false)
        }
      })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(newSession)

      if (!newSession) {
        lastUserId.current = null
        setProfile(null)
        return
      }

      if (newSession.user.id !== lastUserId.current) {
        lastUserId.current = newSession.user.id
        setProfileReady(false)
        setTimeout(async () => {
          await loadProfile(newSession.user.id)
          if (active) setProfileReady(true)
        }, 0)
      }
    })

    return () => {
      active = false
      clearTimeout(fallback)
      listener.subscription.unsubscribe()
    }
  }, [])

  // Pick up access or role changes made by an admin while this user is signed in
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('my-profile-' + userId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.' + userId },
        (payload) => setProfile(payload.new))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value = { session, profile, loading, profileReady, recovering, setRecovering, refreshProfile, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
