import { requireSupabase } from '../../services/supabase/client'
import { getDefaultRouteForRole, usernameToTechnicalEmail, type AppProfile } from './authIdentity'

type SupabaseAuthClient = ReturnType<typeof requireSupabase>
type LoadProfile = (userId: string) => Promise<AppProfile | null>

export async function signInWithUsernamePassword(
  client: SupabaseAuthClient,
  username: string,
  password: string,
  loadProfileByUserId: LoadProfile,
) {
  const email = usernameToTechnicalEmail(username)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return { ok: false as const, message: error?.message || 'Invalid username or password' }
  }

  const nextProfile = await loadProfileByUserId(data.user.id)
  if (!nextProfile) {
    await client.auth.signOut()
    return { ok: false as const, message: 'Profile not configured' }
  }

  return {
    ok: true as const,
    session: data.session,
    profile: nextProfile,
    redirectTo: getDefaultRouteForRole(nextProfile.role),
  }
}
