// The caller profile must come from getCallerProfile, never from request JSON.
// Supply the existing server client; browser credentials are not used here.
export async function assertTournamentAdminMembership(
  profile: { id: string; role: string },
  tournamentId: string,
  lookup: (userId: string, tournamentId: string) => PromiseLike<{ data: { user_id: string } | null; error: unknown }>,
) {
  if (profile.role !== 'admin' || !profile.id || typeof tournamentId !== 'string' || !tournamentId.trim()) {
    throw new Error('not authorized')
  }

  const { data, error } = await lookup(profile.id, tournamentId)

  // Fail closed on unavailable/ambiguous membership; no default-tournament bypass.
  if (error) throw new Error('Unable to verify tournament admin membership')
  if (!data || data.user_id !== profile.id) throw new Error('not authorized')
}
