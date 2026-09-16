import { describe, expect, it } from 'vitest'
import { createEmptyTournamentDomain, mapSupabaseTournamentState, type SupabaseTournamentStateDto } from './tournamentMapper'

const bootstrapDto: SupabaseTournamentStateDto = {
  tournament: { id: 'tournament-id', name: 'Auth Test Bootstrap Tournament', phase: 'GROUP_STAGE' },
  groups: [{ id: 'group-id', name: 'Auth Test Group A' }],
  courts: [
    { id: 'court-1', name: 'Court 1' },
    { id: 'court-2', name: 'Court 2' },
  ],
  rounds: [
    {
      id: 'round-id',
      tournament_id: 'tournament-id',
      name: 'Auth Test Round 1',
      stage: 'group',
      sequence: 1,
      status: 'scheduled',
      dice_result: null,
      dice_rule_id: null,
      dice_started_at: null,
      dice_ends_at: null,
    },
  ],
  teams: [
    { id: 'team-red-id', name: 'Team Red', short_name: 'RED', color: '#E23D28', group_id: 'group-id' },
    { id: 'team-blue-id', name: 'Team Blue', short_name: 'BLUE', color: '#1769E0', group_id: 'group-id' },
  ],
  players: [
    { id: 'red-1', team_id: 'team-red-id', full_name: 'Red Player 1', nickname: 'RED1', gender: 'female' },
    { id: 'red-2', team_id: 'team-red-id', full_name: 'Red Player 2', nickname: 'RED2', gender: 'male' },
    { id: 'red-3', team_id: 'team-red-id', full_name: 'Red Player 3', nickname: 'RED3', gender: 'male' },
    { id: 'blue-1', team_id: 'team-blue-id', full_name: 'Blue Player 1', nickname: 'BLUE1', gender: 'male' },
    { id: 'blue-2', team_id: 'team-blue-id', full_name: 'Blue Player 2', nickname: 'BLUE2', gender: 'female' },
    { id: 'blue-3', team_id: 'team-blue-id', full_name: 'Blue Player 3', nickname: 'BLUE3', gender: 'male' },
  ],
  matches: [
    {
      id: 'match-id',
      round_id: 'round-id',
      group_id: 'group-id',
      court_id: 'court-1',
      team_a_id: 'team-red-id',
      team_b_id: 'team-blue-id',
      status: 'ready',
      current_set: 1,
      games_a: 0,
      games_b: 0,
      sets_a: 0,
      sets_b: 0,
    },
  ],
  lineups: [
    {
      match_id: 'match-id',
      team_id: 'team-red-id',
      set_number: 1,
      active_player_1_id: 'red-1',
      active_player_2_id: 'red-2',
      bench_player_id: 'red-3',
    },
    {
      match_id: 'match-id',
      team_id: 'team-blue-id',
      set_number: 1,
      active_player_1_id: 'blue-1',
      active_player_2_id: 'blue-2',
      bench_player_id: 'blue-3',
    },
  ],
}

describe('mapSupabaseTournamentState', () => {
  it('maps populated Supabase bootstrap rows into the Tournament domain model', () => {
    const tournament = mapSupabaseTournamentState(bootstrapDto)

    expect(tournament.id).toBe('tournament-id')
    expect(tournament.teams).toHaveLength(2)
    expect(tournament.teams[0].players).toHaveLength(3)
    expect(tournament.teams[1].players).toHaveLength(3)
    expect(tournament.teams[0].players[0]).toMatchObject({
      id: 'red-1',
      teamId: 'team-red-id',
      firstName: 'Red',
      lastName: 'Player 1',
      gender: 'woman',
    })
    expect(tournament.matches[0]).toMatchObject({
      id: 'match-id',
      teamAId: 'team-red-id',
      teamBId: 'team-blue-id',
      status: 'ready',
      score: { currentSet: 1, games: { A: 0, B: 0 }, sets: { A: 0, B: 0 } },
    })
    expect(tournament.matches[0].lineups).toHaveLength(2)
  })

  it('returns empty arrays for missing collections', () => {
    const tournament = mapSupabaseTournamentState({
      tournament: { id: 'tournament-id', name: 'Empty Tournament', phase: 'GROUP_STAGE' },
    })

    expect(tournament.groups).toEqual([])
    expect(tournament.courts).toEqual([])
    expect(tournament.rounds).toEqual([])
    expect(tournament.teams).toEqual([])
    expect(tournament.matches).toEqual([])
    expect(tournament.cards).toEqual([])
    expect(tournament.teamCards).toEqual([])
    expect(tournament.diceRules).toEqual([])
    expect(tournament.kaosEvents).toEqual([])
    expect(tournament.matchEvents).toEqual([])
    expect(tournament.globalEvents).toEqual([])
    expect(tournament.standings).toEqual([])
  })

  it('maps teams with an empty players array when no player rows are present', () => {
    const tournament = mapSupabaseTournamentState({
      tournament: { id: 'tournament-id', name: 'Teams Without Players', phase: 'GROUP_STAGE' },
      teams: [
        { id: 'team-red-id', name: 'Team Red', short_name: 'RED', color: '#E23D28', group_id: 'group-id' },
      ],
      players: [],
    })

    expect(tournament.teams).toHaveLength(1)
    expect(tournament.teams[0].players).toEqual([])
    expect(tournament.teams[0].ranking).toBeNull()
  })

  it('preserva il ranking numerico persistito', () => {
    const tournament = mapSupabaseTournamentState({
      tournament: { id: 'tournament-id', name: 'Ranking', phase: 'GROUP_STAGE' },
      teams: [{ id: 'ranked', name: 'Ranked', short_name: 'R', color: '#fff', group_id: null, ranking: 7 }],
    })
    expect(tournament.teams[0].ranking).toBe(7)
  })

  it('prefers first_name and last_name when Supabase roster columns are available', () => {
    const tournament = mapSupabaseTournamentState({
      tournament: { id: 'tournament-id', name: 'Roster Names', phase: 'GROUP_STAGE' },
      teams: [
        { id: 'team-red-id', name: 'Team Red', short_name: 'RED', color: '#E23D28', group_id: 'group-id' },
      ],
      players: [
        {
          id: 'red-1',
          team_id: 'team-red-id',
          first_name: 'Mario',
          last_name: 'Rossi',
          full_name: 'Legacy Name',
          nickname: 'Legacy',
          gender: 'male',
        },
      ],
    })

    expect(tournament.teams[0].players[0]).toMatchObject({
      firstName: 'Mario',
      lastName: 'Rossi',
      name: 'Mario Rossi',
      gender: 'man',
    })
  })

  it('creates an empty Tournament domain object with no undefined arrays', () => {
    const tournament = createEmptyTournamentDomain()

    expect(Object.values({
      groups: tournament.groups,
      courts: tournament.courts,
      rounds: tournament.rounds,
      teams: tournament.teams,
      matches: tournament.matches,
      cards: tournament.cards,
      teamCards: tournament.teamCards,
      diceRules: tournament.diceRules,
      kaosEvents: tournament.kaosEvents,
      matchEvents: tournament.matchEvents,
      globalEvents: tournament.globalEvents,
      standings: tournament.standings,
    }).every(Array.isArray)).toBe(true)
  })
})
