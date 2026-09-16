import type { Team } from '../shared/types/domain'
import type { TeamRepositoryContract } from '../repositories/contracts'
import { buildUniqueTeamUsername, createTeamRosterDraft, toCreateTeamInput, validateTeamRosterDraft } from '../features/admin/setup/teamRosterFormState'
import { listTournamentProvisionedAccounts, provisionTournamentUser } from '../services/supabase/provisioning'

export const DEV_TEST_TEAM_PASSWORD = 'Test1234!'
export type SeedResult = { template: Team; teamId?: string; creationAttempted?: boolean; username: string; status: 'pending' | 'created' | 'active' | 'error'; error?: string }
export const seedSessions = new Map<string, SeedResult[]>()
const busyTournaments = new Set<string>()

// Only session-known results can be retried. No database test marker or deletion is assumed.
export async function seedSupabaseTestData(tournamentId: string, rows: SeedResult[], repository: Pick<TeamRepositoryContract, 'createTeam'>, onUpdate: (rows: SeedResult[]) => void,
  services = { list: listTournamentProvisionedAccounts, provision: provisionTournamentUser }) {
  // TODO: restrict/remove before production release
  // Access remains protected by the Admin UI and existing server authorization.
  if (busyTournaments.has(tournamentId)) throw new Error('A seed is already running for this tournament.')
  busyTournaments.add(tournamentId)
  try {
    const accounts = await services.list(tournamentId)
    const used = [...accounts.map(account => account.username), ...rows.map(row => row.username)].filter(Boolean)
    const results = rows.map(row => ({ ...row }))
    const publish = () => { seedSessions.set(tournamentId, results.map(row => ({ ...row }))); onUpdate(results.map(row => ({ ...row }))) }
    for (const row of results) {
      if (row.status === 'active') continue
      try {
        if (!row.template.id.startsWith(`${tournamentId}:mock-team-`) || !row.template.isTestData) throw new Error('Invalid tournament test template.')
        const draft = createTeamRosterDraft(row.template)
        const validation = validateTeamRosterDraft(draft)
        if (!validation.valid) throw new Error(validation.reason)
        if (!row.teamId) {
          if (row.creationAttempted) throw new Error('Previous team creation has no confirmed ID. Verify it manually before starting another batch; automatic recreation is disabled.')
          const input = toCreateTeamInput(draft)
          // Server generates real UUIDs through the normal roster RPC.
          row.creationAttempted = true
          publish()
          row.teamId = await repository.createTeam({ ...input, tournamentId, players: input.players.map(({ firstName, lastName, gender }) => ({ firstName, lastName, gender })) })
          row.status = 'created'
          publish()
        }
        const existing = accounts.find(account => account.teamId === row.teamId)
        if (existing) throw new Error('Account already exists; its password is unknown. Use normal access management.')
        if (!row.username || accounts.some(account => account.username.toLowerCase() === row.username.toLowerCase())) { row.username = buildUniqueTeamUsername(row.template.name, used); used.push(row.username) }
        const credential = await services.provision({ tournamentId, teamId: row.teamId, teamName: row.template.name, username: row.username, role: 'team', password: DEV_TEST_TEAM_PASSWORD })
        row.username = credential.username
        row.status = 'active'
        row.error = undefined
      } catch (error) { row.status = 'error'; row.error = error instanceof Error ? error.message : 'Seeding failed' }
      publish()
    }
    return results
  } finally { busyTournaments.delete(tournamentId) }
}

export function testCredentialsCsv(rows: SeedResult[]) {
  const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`
  return ['team_name,composition,username,password', ...rows.filter(row => row.status === 'active').map(row => [row.template.name, compositionOf(row.template), row.username, DEV_TEST_TEAM_PASSWORD].map(cell).join(','))].join('\r\n')
}
export function compositionOf(team: Team) {
  const males = team.players.filter(player => player.gender === 'man').length
  return males === 3 ? 'male' : males === 0 ? 'female' : 'mixed'
}
