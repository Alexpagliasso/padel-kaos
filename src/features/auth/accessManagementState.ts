import type { Court, Team, Tournament } from '../../shared/types/domain'
import type { ProvisionableRole } from './authIdentity'

export type PasswordMode = 'auto' | 'manual'

export type ProvisionPreset = {
  label: string
  username: string
  role: ProvisionableRole
  assignmentId?: string
}

export type ExistingProvisionedAccount = {
  id: string
  role: ProvisionableRole
  username: string
  displayName: string
  teamId?: string | null
  courtId?: string | null
}

export function buildProvisionPresets(tournament: Tournament): ProvisionPreset[] {
  const red = findTeam(tournament.teams, 'RED', 'red')
  const blue = findTeam(tournament.teams, 'BLUE', 'blue')
  const courtOne = findCourt(tournament.courts)

  return [
    { label: 'Team Red', username: 'team_red', role: 'team', assignmentId: red?.id },
    { label: 'Team Blue', username: 'team_blue', role: 'team', assignmentId: blue?.id },
    { label: 'Referee', username: 'referee_test', role: 'referee', assignmentId: courtOne?.id },
    { label: 'Court Display', username: 'court_display_test', role: 'court_display', assignmentId: courtOne?.id },
    { label: 'Main Display', username: 'main_display_test', role: 'main_display' },
  ]
}

export function validateManualPassword(password: string) {
  if (password.length < 10) return 'Password must be at least 10 characters.'
  if (!/[a-z]/i.test(password)) return 'Password must contain at least one letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
  return ''
}

export function validateSingleAccountInput(input: {
  username: string
  assignmentId?: string
  needsAssignment: boolean
  passwordMode: PasswordMode
  password: string
  confirmPassword: string
}) {
  if (!input.username.trim()) return 'Username is required.'
  if (input.needsAssignment && !input.assignmentId) return 'Assignment is required.'
  if (input.passwordMode === 'manual') {
    const passwordError = validateManualPassword(input.password)
    if (passwordError) return passwordError
    if (input.password !== input.confirmPassword) return 'Passwords do not match.'
  }
  return ''
}

export function buildCredentialsFileName(date = new Date()) {
  return `padel-kaos-team-credentials-${date.toISOString().slice(0, 10)}.csv`
}

export function findTeamAccount(accounts: ExistingProvisionedAccount[], teamId: string) {
  return accounts.find((account) => account.role === 'team' && account.teamId === teamId)
}

export function getAssignmentLabel(account: ExistingProvisionedAccount, tournament: Tournament) {
  if (account.role === 'team') {
    return tournament.teams.find((team) => team.id === account.teamId)?.name ?? 'Team not found'
  }
  if (account.role === 'referee' || account.role === 'court_display') {
    return tournament.courts.find((court) => court.id === account.courtId)?.name ?? 'Court not found'
  }
  return tournament.name
}

export function getExistingAccountDisplay(account: ExistingProvisionedAccount, tournament: Tournament) {
  const assignment = getAssignmentLabel(account, tournament)
  return {
    title: account.role === 'team' ? assignment : account.displayName,
    role: account.role,
    username: account.username,
    assignment,
    status: 'active',
    passwordLabel: 'Password: NOT STORED',
    resetLabel: 'Reset Password - Coming next',
  }
}

function findTeam(teams: Team[], shortName: string, nameToken: string) {
  return teams.find((team) => team.shortName.toUpperCase() === shortName)
    ?? teams.find((team) => team.name.toLowerCase().includes(nameToken))
}

function findCourt(courts: Court[]) {
  return courts.find((court) => court.name.toLowerCase().includes('1')) ?? courts[0]
}
