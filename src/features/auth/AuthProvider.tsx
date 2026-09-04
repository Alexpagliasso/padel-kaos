import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { dataProvider } from '../../repositories'
import { requireSupabase, supabase } from '../../services/supabase/client'
import { authProfileSchema, mapProfile, usernameToTechnicalEmail, type AppProfile } from './authIdentity'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'
import { signInWithUsernamePassword } from './authSignIn'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    dataProvider === 'demo' ? 'authenticated' : supabase ? 'loading' : 'unauthenticated',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AppProfile | null>(
    dataProvider === 'demo'
      ? { id: 'demo-admin', tournamentId: 'demo-tournament', role: 'admin', username: 'demo', displayName: 'Demo Admin' }
      : null,
  )

  useEffect(() => {
    if (dataProvider === 'demo' || !supabase) return undefined

    let active = true

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) {
        setSession(null)
        setProfile(null)
        setStatus('unauthenticated')
        return
      }
      setSession(data.session)
      const nextProfile = data.session ? await loadProfile(data.session.user.id) : null
      if (!active) return
      setProfile(nextProfile)
      setStatus(nextProfile ? 'authenticated' : 'unauthenticated')
    }).catch(() => {
      if (!active) return
      setSession(null)
      setProfile(null)
      setStatus('unauthenticated')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setStatus('unauthenticated')
        return
      }
      loadProfile(nextSession.user.id).then((nextProfile) => {
        setProfile(nextProfile)
        setStatus(nextProfile ? 'authenticated' : 'unauthenticated')
      }).catch(() => {
        setProfile(null)
        setStatus('unauthenticated')
      })
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      signInWithUsername: async (username, password) => {
        const client = requireSupabase()
        const result = await signInWithUsernamePassword(client, username, password, loadProfile)
        if (!result.ok) return result

        setSession(result.session)
        setProfile(result.profile)
        setStatus('authenticated')
        return { ok: true, redirectTo: result.redirectTo }
      },
      reauthenticateForReset: async (password) => {
        if (!profile || profile.role !== 'admin') return false
        const client = requireSupabase()
        const email = usernameToTechnicalEmail(profile.username)
        const { data, error } = await client.auth.signInWithPassword({ email, password })
        return !error && data.user?.id === profile.id
      },
      logout: async () => {
        if (dataProvider === 'demo') return
        await requireSupabase().auth.signOut()
        setSession(null)
        setProfile(null)
        setStatus('unauthenticated')
      },
      refreshProfile: async () => {
        if (!session) return profile
        const nextProfile = await loadProfile(session.user.id)
        setProfile(nextProfile)
        setStatus(nextProfile ? 'authenticated' : 'unauthenticated')
        return nextProfile
      },
    }),
    [profile, session, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function loadProfile(userId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('id,tournament_id,role,username,display_name,team_id,court_id')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return mapProfile(authProfileSchema.parse(data))
}
