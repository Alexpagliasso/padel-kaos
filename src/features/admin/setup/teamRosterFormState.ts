import type { CreateTeamInput } from '../../../demo/demoTypes'
import type { Player, Team, Tournament } from '../../../shared/types/domain'
import { getPlayerDisplayName } from '../../../shared/lib/playerNames'
import type { ExistingProvisionedAccount } from '../../auth/accessManagementState'
import { findTeamAccount } from '../../auth/accessManagementState'

export { getPlayerDisplayName }

export type RosterGender = 'male' | 'female' | ''

export type TeamRosterPlayerDraft = {
  id?: string
  firstName: string
  lastName: string
  gender: RosterGender
}

export type TeamRosterDraft = {
  teamId?: string
  teamName: string
  color: string
  players: TeamRosterPlayerDraft[]
  access: TeamAccessDraft
}

export type TeamAccessDraft = {
  username: string
}

export type CreatedTeamCredential = {
  teamName: string
  username: string
  temporaryPassword: string
}

export type PendingTeamLogin = {
  teamId: string
  teamName: string
  username: string
}

export type TeamRosterValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function createEmptyTeamRosterDraft(): TeamRosterDraft {
  return {
    teamName: '',
    color: '#FFD000',
    players: Array.from({ length: 3 }, () => ({ firstName: '', lastName: '', gender: '' })),
    access: createTeamAccessDraft(''),
  }
}

export function createTeamRosterDraft(team: Team): TeamRosterDraft {
  return {
    teamId: team.id,
    teamName: team.name,
    color: team.color,
    players: Array.from({ length: 3 }, (_, index) => {
      const player = team.players[index]
      return player ? mapPlayerToDraft(player) : { firstName: '', lastName: '', gender: '' }
    }),
    access: createTeamAccessDraft(team.name),
  }
}

export function createTeamAccessDraft(teamName: string): TeamAccessDraft {
  return {
    username: buildTeamUsername(teamName),
  }
}

export function validateTeamRosterDraft(draft: TeamRosterDraft): TeamRosterValidationResult {
  if (!draft.teamName.trim()) return { valid: false, reason: 'Team name is required.' }
  if (draft.players.length !== 3) return { valid: false, reason: 'Exactly 3 players are required.' }

  for (const [index, player] of draft.players.entries()) {
    const label = `Player ${index + 1}`
    if (!player.firstName.trim()) return { valid: false, reason: `${label} first name is required.` }
    if (!player.lastName.trim()) return { valid: false, reason: `${label} last name is required.` }
    if (player.gender !== 'male' && player.gender !== 'female') return { valid: false, reason: `${label} gender is required.` }
  }

  return { valid: true }
}

export function toCreateTeamInput(draft: TeamRosterDraft): CreateTeamInput {
  return {
    name: draft.teamName.trim(),
    color: draft.color,
    players: draft.players.map((player) => ({
      id: player.id,
      firstName: player.firstName.trim(),
      lastName: player.lastName.trim(),
      gender: player.gender as 'male' | 'female',
    })),
  }
}

export function validateTeamAccessDraft(access: TeamAccessDraft) {
  if (!access.username.trim()) return 'Username is required.'
  return ''
}

export function buildTeamUsername(teamName: string) {
  return teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function buildUniqueTeamUsername(teamName: string, usedUsernames: string[]) {
  const baseUsername = buildTeamUsername(teamName)
  if (!baseUsername) return ''

  const used = new Set(usedUsernames.map((username) => username.trim().toLowerCase()))
  if (!used.has(baseUsername)) return baseUsername

  let suffix = 2
  let candidate = `${baseUsername}_${suffix}`
  while (used.has(candidate)) {
    suffix += 1
    candidate = `${baseUsername}_${suffix}`
  }
  return candidate
}

export function getTeamAccountState(team: Team, accounts: ExistingProvisionedAccount[]) {
  const account = findTeamAccount(accounts, team.id)
  if (account) {
    return {
      status: 'active' as const,
      label: 'ACCOUNT ACTIVE',
      username: account.username,
    }
  }

  return {
    status: 'missing' as const,
    label: 'ACCOUNT MISSING',
    username: '',
  }
}

export function isRosterComplete(team: Team) {
  return team.players.length === 3 && team.players.every((player) => player.firstName.trim() && player.lastName.trim())
}

export function canEditRoster(tournament: Pick<Tournament, 'status'>) {
  return tournament.status === undefined || tournament.status === 'draft' || tournament.status === 'configured'
}

export function formatTeamRoster(team: Team) {
  return team.players.map(getPlayerDisplayName)
}

function mapPlayerToDraft(player: Player): TeamRosterPlayerDraft {
  return {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    gender: player.gender === 'woman' ? 'female' : 'male',
  }
}
