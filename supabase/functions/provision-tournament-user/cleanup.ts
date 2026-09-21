export type OperationalRole = 'team' | 'referee' | 'court_display' | 'main_display'
export type CleanupProfile = { id: string; role: OperationalRole | 'admin' }
export type CleanupResult = { deleted: number; alreadyMissing: number; failed: number }

export type CleanupDependencies = {
  getTournamentStatus: (tournamentId: string) => Promise<string>
  listProfiles: (tournamentId: string) => Promise<CleanupProfile[]>
  deleteAuthUser: (userId: string) => Promise<{ error?: { message?: string; status?: number } | null }>
  deleteProfile: (userId: string, tournamentId: string) => Promise<void>
}

const operationalRoles = new Set<string>(['team', 'referee', 'court_display', 'main_display'])

export async function cleanupTournamentAuth(
  tournamentId: string,
  callerId: string,
  dependencies: CleanupDependencies,
): Promise<CleanupResult> {
  const status = await dependencies.getTournamentStatus(tournamentId)
  if (status !== 'draft' && status !== 'configured') throw new Error('tournament deletion locked after start')

  const profiles = await dependencies.listProfiles(tournamentId)
  const result: CleanupResult = { deleted: 0, alreadyMissing: 0, failed: 0 }
  for (const profile of profiles) {
    if (profile.id === callerId || !operationalRoles.has(profile.role)) continue
    try {
      const { error } = await dependencies.deleteAuthUser(profile.id)
      if (error && !isMissingUser(error)) { result.failed += 1; continue }
      await dependencies.deleteProfile(profile.id, tournamentId)
      if (error) result.alreadyMissing += 1
      else result.deleted += 1
    } catch {
      result.failed += 1
    }
  }
  return result
}

function isMissingUser(error: { message?: string; status?: number }) {
  return error.status === 404 || /user not found|user does not exist/i.test(error.message ?? '')
}
