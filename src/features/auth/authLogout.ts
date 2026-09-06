export type SupabaseLogoutClient = {
  auth: {
    signOut: () => Promise<{ error: { message?: string } | null }>
  }
}

export async function signOutSupabaseSession(client: SupabaseLogoutClient) {
  const { error } = await client.auth.signOut()
  if (error) throw new Error(error.message || 'Unable to logout')
}

export function getLogoutRedirectTarget() {
  return '/login'
}
