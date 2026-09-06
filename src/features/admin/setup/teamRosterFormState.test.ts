import { describe, expect, it } from 'vitest'
import type { Team, Tournament } from '../../../shared/types/domain'
import { calculateGenderStartingScore, buildGenderAwareLineup } from '../../../domain/rules/rulesEngine'
import {
  buildTeamUsername,
  buildUniqueTeamUsername,
  canEditRoster,
  createTeamRosterDraft,
  getPlayerDisplayName,
  getTeamAccountState,
  isRosterComplete,
  toCreateTeamInput,
  validateTeamAccessDraft,
  validateTeamRosterDraft,
} from './teamRosterFormState'

const team: Team = {
  id: 'team-red',
  name: 'Team Red',
  shortName: 'RED',
  color: '#FF405C',
  groupId: 'group-a',
  players: [
    { id: 'p1', teamId: 'team-red', firstName: 'Mario', lastName: 'Rossi', name: 'Mario Rossi', nickname: 'Mario', gender: 'man', accessToken: '' },
    { id: 'p2', teamId: 'team-red', firstName: 'Giulia', lastName: 'Ferri', name: 'Giulia Ferri', nickname: 'Giulia', gender: 'woman', accessToken: '' },
    { id: 'p3', teamId: 'team-red', firstName: 'Leo', lastName: 'Costa', name: 'Leo Costa', nickname: 'Leo', gender: 'man', accessToken: '' },
  ],
}

describe('team roster form state', () => {
  it('accepts a team with exactly 3 valid players', () => {
    expect(validateTeamRosterDraft(createTeamRosterDraft(team))).toEqual({ valid: true })
  })

  it.each([
    [createTeamRosterDraft(team).players.slice(0, 2), 'Exactly 3 players are required.'],
    [[...createTeamRosterDraft(team).players, createTeamRosterDraft(team).players[0]], 'Exactly 3 players are required.'],
  ])('rejects a team with an invalid roster size', (players, reason) => {
    expect(validateTeamRosterDraft({ ...createTeamRosterDraft(team), players })).toEqual({ valid: false, reason })
  })

  it('rejects missing first name, last name and gender', () => {
    const draft = createTeamRosterDraft(team)

    expect(validateTeamRosterDraft({ ...draft, players: [{ ...draft.players[0], firstName: '' }, draft.players[1], draft.players[2]] }))
      .toEqual({ valid: false, reason: 'Player 1 first name is required.' })
    expect(validateTeamRosterDraft({ ...draft, players: [draft.players[0], { ...draft.players[1], lastName: '' }, draft.players[2]] }))
      .toEqual({ valid: false, reason: 'Player 2 last name is required.' })
    expect(validateTeamRosterDraft({ ...draft, players: [draft.players[0], draft.players[1], { ...draft.players[2], gender: '' }] }))
      .toEqual({ valid: false, reason: 'Player 3 gender is required.' })
  })

  it('keeps player ids when editing a roster', () => {
    const input = toCreateTeamInput(createTeamRosterDraft(team))

    expect(input.players.map((player) => player.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('detects incomplete rosters and lifecycle read-only states', () => {
    expect(isRosterComplete(team)).toBe(true)
    expect(isRosterComplete({ ...team, players: team.players.slice(0, 2) })).toBe(false)
    expect(canEditRoster({ status: 'draft' } as Tournament)).toBe(true)
    expect(canEditRoster({ status: 'configured' } as Tournament)).toBe(true)
    expect(canEditRoster({ status: 'live' } as Tournament)).toBe(false)
    expect(canEditRoster({ status: 'completed' } as Tournament)).toBe(false)
    expect(canEditRoster({ status: 'archived' } as Tournament)).toBe(false)
  })

  it('uses a single display-name helper', () => {
    expect(getPlayerDisplayName(team.players[0])).toBe('Mario Rossi')
  })

  it('propagates admin-saved gender into handicap scoring', () => {
    const matchLineup = { teamId: 'team-red', setNumber: 1, activePlayerIds: ['p1', 'p2'] as [string, string], benchPlayerId: 'p3' }
    const opponentLineup = { activePlayers: [{ id: 'o1', gender: 'man' as const }, { id: 'o2', gender: 'man' as const }] }

    expect(calculateGenderStartingScore(buildGenderAwareLineup(team, matchLineup), opponentLineup)).toEqual({ teamA: 1, teamB: 0 })
  })

  it('generates automatic usernames from team names', () => {
    expect(buildTeamUsername('Team Red')).toBe('team_red')
    expect(buildTeamUsername('FC Smash Torino')).toBe('fc_smash_torino')
  })

  it('adds a suffix when an automatic username is already used', () => {
    expect(buildUniqueTeamUsername('Team Red', ['team_red'])).toBe('team_red_2')
    expect(buildUniqueTeamUsername('Team Red', ['team_red', 'team_red_2'])).toBe('team_red_3')
  })

  it('validates team access username without manual password state', () => {
    expect(validateTeamAccessDraft({ username: 'team_red' })).toBe('')
    expect(validateTeamAccessDraft({ username: '' })).toBe('Username is required.')
  })

  it('identifies active and missing team accounts without exposing passwords', () => {
    expect(getTeamAccountState(team, [])).toMatchObject({ status: 'missing', label: 'ACCOUNT MISSING' })
    expect(getTeamAccountState(team, [{
      id: 'profile-red',
      role: 'team',
      username: 'team_red',
      displayName: 'Team Red',
      teamId: 'team-red',
    }])).toMatchObject({ status: 'active', label: 'ACCOUNT ACTIVE', username: 'team_red' })
  })
})
