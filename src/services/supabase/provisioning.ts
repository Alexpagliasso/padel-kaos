import { requireSupabase } from './client'
import { getAuthTournamentSlug } from '../../features/auth/authIdentity'
import type { ExistingProvisionedAccount } from '../../features/auth/accessManagementState'
import type { ProvisionableRole } from '../../features/auth/authIdentity'
import type { Court } from '../../shared/types/domain'
import type { Team } from '../../shared/types/domain'
import { buildUniqueTeamUsername } from '../../features/admin/setup/teamRosterFormState'

export const STANDARD_TEST_PASSWORD = 'Test123456789!'
export type ProvisioningGroupResult = { created: ProvisionedCredential[]; existing: number; failed: Array<{ name: string; reason: string }> }
export type TournamentProvisioningResult = { teams: ProvisioningGroupResult; referees: ProvisioningGroupResult }

export async function provisionTournamentOperationalAccounts(input: {
  tournamentId: string; teams: Team[]; courts: Court[]; accounts: ExistingProvisionedAccount[]
  provision?: typeof provisionTournamentUser
}) {
  const provision = input.provision ?? provisionTournamentUser
  const result: TournamentProvisioningResult = {
    teams: { created: [], existing: 0, failed: [] },
    referees: { created: [], existing: 0, failed: [] },
  }
  const used = [
    ...input.accounts.map(account => account.username.toLowerCase()),
  ]
  for (const team of input.teams) {
    if (input.accounts.some(account => account.role === 'team' && account.teamId === team.id)) {
      result.teams.existing += 1
      continue
    }
    const username = buildUniqueTeamUsername(team.name, used)
    if (!username) { result.teams.failed.push({ name: team.name, reason: 'Nome squadra non valido' }); continue }
    used.push(username)
    try {
      const credential = await provision({ tournamentId: input.tournamentId, role: 'team', teamId: team.id,
        teamName: team.name, username, password: STANDARD_TEST_PASSWORD })
      result.teams.created.push({ ...credential, teamName: team.name })
    } catch (error) { result.teams.failed.push({ name: team.name, reason: safeBulkError(error) }) }
  }
  const orderedCourts = [...input.courts].sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }) || a.id.localeCompare(b.id))
  const missing = getMissingRefereeCourts(orderedCourts, input.accounts)
  result.referees.existing = orderedCourts.length - missing.length
  for (const court of missing) {
    const number = orderedCourts.findIndex(item => item.id === court.id) + 1
    const base = `arbitro${number}`
    let created = false
    for (let suffix = 1; suffix <= 100; suffix += 1) {
      const username = suffix === 1 ? base : `${base}-${suffix}`
      if (used.includes(username)) continue
      used.push(username)
      try {
        const credential = await provision({ tournamentId: input.tournamentId, role: 'referee', courtId: court.id,
          teamName: `Arbitro ${number}`, username, password: STANDARD_TEST_PASSWORD })
        result.referees.created.push({ ...credential, courtId: court.id })
        created = true
        break
      } catch (error) {
        if (isUsernameCollision(error)) continue
        result.referees.failed.push({ name: court.name, reason: safeBulkError(error) })
        break
      }
    }
    if (!created && !result.referees.failed.some(item => item.name === court.name)) {
      result.referees.failed.push({ name: court.name, reason: 'Nessun nome utente disponibile per questo arbitro.' })
    }
  }
  return result
}

function safeBulkError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (isUsernameCollision(error)) return 'Nome utente già presente.'
  if (message.includes('not authorized')) return 'Operazione non autorizzata.'
  return 'Creazione non riuscita. Riprova o verifica il servizio di provisioning.'
}

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

export class RefereeProvisioningError extends Error {
  readonly createdCredentials: ProvisionedCredential[]

  constructor(message: string, createdCredentials: ProvisionedCredential[]) {
    super(message)
    this.name = 'RefereeProvisioningError'
    this.createdCredentials = createdCredentials
  }
}

export function getProvisioningErrorMessage(error: unknown) {
  if (!error) return 'Impossibile creare le credenziali.'
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('failed to fetch') || normalized.includes('function') || normalized.includes('404')) {
    return 'Servizio di creazione credenziali non disponibile.'
  }
  if (normalized.includes('already') || normalized.includes('duplicate') || normalized.includes('unique')) {
    return 'Il nome utente o il profilo esiste già.'
  }
  if (normalized.includes('not authenticated') || normalized.includes('jwt')) {
    return 'È richiesta una sessione amministratore valida.'
  }
  if (normalized.includes('not authorized')) {
    return 'Non sei autorizzato a creare credenziali per questo torneo.'
  }

  return message || 'Impossibile creare le credenziali.'
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
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      body: {
        ...input,
        action: 'provision',
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
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    body: {
      action: 'provision',
      tournamentId: input.tournamentId,
      tournamentSlug: getAuthTournamentSlug(),
      password: STANDARD_TEST_PASSWORD,
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

export function getMissingRefereeCourts(courts: Court[], accounts: ExistingProvisionedAccount[]) {
  const coveredCourtIds = new Set(accounts
    .filter((account) => account.role === 'referee')
    .flatMap((account) => account.courtIds ?? (account.courtId ? [account.courtId] : [])))
  return [...courts]
    .sort((left, right) => left.name.localeCompare(right.name, 'it', { numeric: true }) || left.id.localeCompare(right.id))
    .filter((court) => !coveredCourtIds.has(court.id))
}

export async function provisionMissingRefereeAccounts(input: {
  tournamentId: string
  courts: Court[]
  accounts: ExistingProvisionedAccount[]
  provision?: typeof provisionTournamentUser
}) {
  const provision = input.provision ?? provisionTournamentUser
  const orderedCourts = [...input.courts]
    .sort((left, right) => left.name.localeCompare(right.name, 'it', { numeric: true }) || left.id.localeCompare(right.id))
  const missingCourts = getMissingRefereeCourts(orderedCourts, input.accounts)
  const usedUsernames = new Set(input.accounts.map((account) => account.username.trim().toLowerCase()))
  const credentials: ProvisionedCredential[] = []

  for (const court of missingCourts) {
    const courtNumber = orderedCourts.findIndex((candidate) => candidate.id === court.id) + 1
    const displayName = `Arbitro ${courtNumber}`
    const baseUsername = `arbitro${courtNumber}`
    let suffix = 1

    while (suffix <= 100) {
      const candidate = suffix === 1 ? baseUsername : `${baseUsername}-${suffix}`
      suffix += 1
      if (usedUsernames.has(candidate)) continue
      try {
        const credential = await provision({
          tournamentId: input.tournamentId,
          username: candidate,
          role: 'referee',
          courtId: court.id,
          teamName: displayName,
        })
        credentials.push({ ...credential, teamName: credential.teamName ?? displayName, courtId: credential.courtId ?? court.id })
        usedUsernames.add(candidate)
        break
      } catch (error) {
        if (isUsernameCollision(error)) continue
        throw new RefereeProvisioningError(getProvisioningErrorMessage(error), credentials)
      }
    }

    if (!credentials.some((credential) => credential.courtId === court.id)) {
      throw new RefereeProvisioningError(`Impossibile trovare un nome utente disponibile per ${displayName}.`, credentials)
    }
  }

  return credentials
}

export async function listTournamentProvisionedAccounts(tournamentId: string) {
  const client = requireSupabase()
  const [profilesResult, assignmentsResult] = await Promise.all([
    client.from('profiles').select('id,role,username,display_name,team_id,court_id')
      .eq('tournament_id', tournamentId).neq('role', 'admin')
      .order('role', { ascending: true }).order('username', { ascending: true }),
    client.from('referee_court_assignments').select('referee_user_id,court_id').eq('tournament_id', tournamentId),
  ])

  if (profilesResult.error) throw profilesResult.error
  if (assignmentsResult.error) throw assignmentsResult.error
  return (profilesResult.data ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    username: row.username,
    displayName: row.display_name,
    teamId: row.team_id,
    courtId: row.court_id,
    courtIds: (assignmentsResult.data ?? []).filter((assignment) => assignment.referee_user_id === row.id).map((assignment) => assignment.court_id),
  })) as ExistingProvisionedAccount[]
}

export async function replaceRefereeCourtAssignments(refereeUserId: string, courtIds: string[]) {
  const { error } = await requireSupabase().rpc('replace_referee_court_assignments', {
    p_referee_user_id: refereeUserId,
    p_court_ids: courtIds,
  })
  if (error) throw new Error(getProvisioningErrorMessage(error))
}

export async function setRefereeCourtAssignment(tournamentId: string, courtId: string, refereeUserId: string | null) {
  const { error } = await requireSupabase().rpc('set_referee_court_assignment', {
    p_tournament_id: tournamentId,
    p_court_id: courtId,
    p_referee_user_id: refereeUserId,
  })
  if (error) {
    if (import.meta.env.DEV) console.error('Court assignment RPC failed', {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    })
    if (error.message.includes('not authorized')) throw new Error('Non sei autorizzato a modificare gli arbitri.')
    if (error.message.includes('referee does not belong')) throw new Error('Seleziona un arbitro di questo torneo.')
    if (error.message.includes('court does not belong')) throw new Error('Il campo non appartiene a questo torneo.')
    throw new Error('Assegnazione non riuscita. Ricarica la Regia e riprova.', { cause: error })
  }
}

export async function listMyRefereeCourtIds(tournamentId: string, refereeUserId: string) {
  const { data, error } = await requireSupabase().from('referee_court_assignments').select('court_id')
    .eq('tournament_id', tournamentId).eq('referee_user_id', refereeUserId).order('created_at')
  if (error) throw error
  return (data ?? []).map((row) => row.court_id)
}

export async function cleanupTournamentAuthUsers(tournamentId: string) {
  const { data, error } = await requireSupabase().functions.invoke<{ deleted: number; alreadyMissing: number; failed: number }>('provision-tournament-user', {
    body: { action: 'cleanup_tournament_auth', tournamentId },
  })
  if (error) throw error
  if (!data || !Number.isInteger(data.failed) || data.failed > 0) {
    throw new Error(`Pulizia account incompleta: ${data?.failed ?? 'esito sconosciuto'} account non rimossi. Riprova prima di eliminare il torneo.`)
  }
  return data
}

export function credentialsToCsv(credentials: ProvisionedCredential[]) {
  const rows = [
    ['role', 'team_name', 'username', 'temporary_password'],
    ...credentials.map((credential) => [
      credential.role,
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

function isUsernameCollision(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return message.includes('already') || message.includes('duplicate') || message.includes('unique') || message.includes('esiste gi')
}
