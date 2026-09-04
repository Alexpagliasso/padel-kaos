import { requireSupabase } from './client'
import { getAuthTournamentSlug } from '../../features/auth/authIdentity'
import type { ProvisionableRole } from '../../features/auth/authIdentity'

export type ProvisionTournamentUserInput = {
  tournamentId: string
  username: string
  role: ProvisionableRole
  password?: string
  teamId?: string
  courtId?: string
  tournamentSlug?: string
}

export type ProvisionedCredential = {
  username: string
  temporaryPassword?: string
  role: ProvisionableRole
  teamId?: string
  courtId?: string
}

export async function provisionTournamentUser(input: ProvisionTournamentUserInput) {
  const { data, error } = await requireSupabase().functions.invoke<ProvisionedCredential>('provision-tournament-user', {
    body: { ...input, tournamentSlug: input.tournamentSlug ?? getAuthTournamentSlug() },
  })
  if (error) throw error
  if (!data) throw new Error('Provisioning returned no data')
  return data
}

export async function provisionTeamAccounts(input: {
  tournamentId: string
  teams: Array<{ id: string; name: string; shortName: string }>
}) {
  const { data, error } = await requireSupabase().functions.invoke<{ credentials: ProvisionedCredential[] }>('provision-tournament-user', {
    body: {
      tournamentId: input.tournamentId,
      tournamentSlug: getAuthTournamentSlug(),
      bulkTeams: input.teams.map((team) => ({
        teamId: team.id,
        username: team.shortName || team.name,
      })),
    },
  })
  if (error) throw error
  return data?.credentials ?? []
}

export async function cleanupTournamentAuthUsers(tournamentId: string) {
  const { data, error } = await requireSupabase().functions.invoke<{ deletedUserIds: string[] }>('cleanup-tournament-auth-users', {
    body: { tournamentId },
  })
  if (error) throw error
  return data ?? { deletedUserIds: [] }
}

export function credentialsToCsv(credentials: ProvisionedCredential[]) {
  const rows = [
    ['role', 'team_id', 'court_id', 'username', 'temporary_password'],
    ...credentials.map((credential) => [
      credential.role,
      credential.teamId ?? '',
      credential.courtId ?? '',
      credential.username,
      credential.temporaryPassword ?? '',
    ]),
  ]

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
