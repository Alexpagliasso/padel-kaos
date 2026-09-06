import { requireSupabase } from './client'
import { getAuthTournamentSlug } from '../../features/auth/authIdentity'
import type { ExistingProvisionedAccount } from '../../features/auth/accessManagementState'
import type { ProvisionableRole } from '../../features/auth/authIdentity'

export type ProvisionTournamentUserInput = {
  tournamentId: string
  username: string
  role: ProvisionableRole
  password?: string
  teamId?: string
  teamName?: string
  courtId?: string
  tournamentSlug?: string
}

export type ProvisionedCredential = {
  username: string
  temporaryPassword?: string
  role: ProvisionableRole
  teamId?: string
  courtId?: string
  teamName?: string
}

export function getProvisioningErrorMessage(error: unknown) {
  if (!error) return 'Provisioning failed'
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('failed to fetch') || normalized.includes('function') || normalized.includes('404')) {
    return 'Provisioning service unavailable'
  }
  if (normalized.includes('already') || normalized.includes('duplicate') || normalized.includes('unique')) {
    return 'Username or profile already exists'
  }
  if (normalized.includes('not authenticated') || normalized.includes('jwt')) {
    return 'Admin session required'
  }
  if (normalized.includes('not authorized')) {
    return 'Admin role required'
  }

  return message || 'Provisioning failed'
}

async function getFunctionInvokeErrorMessage(error: unknown) {
  const context = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: unknown }).context
    : undefined

  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown; message?: unknown }
      const bodyMessage = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : ''
      if (bodyMessage) return getProvisioningErrorMessage(bodyMessage)
    } catch {
      return getProvisioningErrorMessage(error)
    }
  }

  return getProvisioningErrorMessage(error)
}

export async function provisionTournamentUser(input: ProvisionTournamentUserInput) {
  const client = requireSupabase()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Admin session required')

  const { data, error } = await client.functions.invoke<ProvisionedCredential>(
    'provision-tournament-user',
    {
      body: {
        ...input,
        password: input.password || undefined,
        tournamentSlug: input.tournamentSlug ?? getAuthTournamentSlug(),
      },
    },
  )
  if (error) throw new Error(await getFunctionInvokeErrorMessage(error))
  if (!data) throw new Error('Provisioning returned no data')
  return data
}

export async function provisionTeamAccounts(input: {
  tournamentId: string
  teams: Array<{ id: string; name: string; shortName: string; username?: string }>
}) {
  const client = requireSupabase()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Admin session required')

  const { data, error } = await client.functions.invoke<{ credentials: ProvisionedCredential[] }>('provision-tournament-user', {
    body: {
      tournamentId: input.tournamentId,
      tournamentSlug: getAuthTournamentSlug(),
      bulkTeams: input.teams.map((team) => ({
        teamId: team.id,
        teamName: team.name,
        username: (team.username ?? team.shortName) || team.name,
      })),
    },
  })
  if (error) throw new Error(await getFunctionInvokeErrorMessage(error))
  const credentials = data?.credentials ?? []
  return credentials.map((credential) => ({
    ...credential,
    teamName: credential.teamName ?? input.teams.find((team) => team.id === credential.teamId)?.name,
  }))
}

export async function listTournamentProvisionedAccounts(tournamentId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('id,role,username,display_name,team_id,court_id')
    .eq('tournament_id', tournamentId)
    .neq('role', 'admin')
    .order('role', { ascending: true })
    .order('username', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    username: row.username,
    displayName: row.display_name,
    teamId: row.team_id,
    courtId: row.court_id,
  })) as ExistingProvisionedAccount[]
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
    ['team_name', 'username', 'temporary_password'],
    ...credentials.map((credential) => [
      credential.teamName ?? '',
      credential.username,
      credential.temporaryPassword ?? '',
    ]),
  ]

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
