import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../features/auth/authContext'
import type { AppProfile } from '../features/auth/authIdentity'
import { mapSupabaseTournamentState, type SupabaseTournamentStateDto } from '../repositories/supabase/mappers/tournamentMapper'
import type { Tournament } from '../shared/types/domain'
import { PlayerRouteContent } from './PlayerRoute'
import { resolvePlayerRouteState } from './playerRouteState'

const profile: AppProfile = {
  id: 'team-red-user',
  tournamentId: 'tournament-id',
  role: 'team',
  username: 'team_red',
  displayName: 'Team Red',
  teamId: 'team-red-id',
  courtId: null,
}

const bootstrapDto: SupabaseTournamentStateDto = {
  tournament: { id: 'tournament-id', name: 'Auth Test Bootstrap Tournament', phase: 'GROUP_STAGE', status: 'configured' },
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

function createTournament() {
  return mapSupabaseTournamentState(bootstrapDto)
}

describe('resolvePlayerRouteState', () => {
  it('resolves a Supabase team from the authenticated profile team_id', () => {
    const state = resolvePlayerRouteState({
      provider: 'supabase',
      tournament: createTournament(),
      profile,
      demoSelectedTeamId: 'team-blue-id',
    })

    expect(state.type).toBe('ready')
    expect(state.type === 'ready' ? state.playerTeam.id : '').toBe('team-red-id')
    expect(state.type === 'ready' ? state.greetingName : '').toBe('Red Player 1')
    expect(state.type === 'ready' ? state.showDemoTeamSelector : true).toBe(false)
  })

  it('returns a controlled error when team_id is missing', () => {
    const state = resolvePlayerRouteState({
      provider: 'supabase',
      tournament: createTournament(),
      profile: { ...profile, teamId: null },
      demoSelectedTeamId: 'team-red-id',
    })

    expect(state).toMatchObject({ type: 'error', title: 'Team profile missing' })
  })

  it('returns a controlled error when the profile team is not in the tournament', () => {
    const state = resolvePlayerRouteState({
      provider: 'supabase',
      tournament: createTournament(),
      profile: { ...profile, teamId: 'missing-team' },
      demoSelectedTeamId: 'team-red-id',
    })

    expect(state).toMatchObject({ type: 'error', title: 'Team not found' })
  })

  it('returns a controlled error when the team has no players', () => {
    const tournament: Tournament = {
      ...createTournament(),
      teams: createTournament().teams.map((team) => team.id === 'team-red-id' ? { ...team, players: [] } : team),
    }

    const state = resolvePlayerRouteState({
      provider: 'supabase',
      tournament,
      profile,
      demoSelectedTeamId: 'team-red-id',
    })

    expect(state).toMatchObject({ type: 'error', title: 'No players configured' })
  })

  it('returns a controlled error when the team has no match', () => {
    const state = resolvePlayerRouteState({
      provider: 'supabase',
      tournament: { ...createTournament(), matches: [] },
      profile,
      demoSelectedTeamId: 'team-red-id',
    })

    expect(state).toMatchObject({ type: 'error', title: 'No match configured' })
  })

  it('keeps demo mode driven by the demo selected team id', () => {
    const state = resolvePlayerRouteState({
      provider: 'demo',
      tournament: createTournament(),
      profile: { ...profile, teamId: 'team-red-id' },
      demoSelectedTeamId: 'team-blue-id',
    })

    expect(state.type).toBe('ready')
    expect(state.type === 'ready' ? state.playerTeam.id : '').toBe('team-blue-id')
    expect(state.type === 'ready' ? state.showDemoTeamSelector : false).toBe(true)
  })
})

describe('PlayerRouteContent', () => {
  it('renders the Supabase bootstrap player experience without crashing', () => {
    const tournament = createTournament()
    const routeState = resolvePlayerRouteState({
      provider: 'supabase',
      tournament,
      profile,
      demoSelectedTeamId: 'team-blue-id',
    })

    if (routeState.type !== 'ready') throw new Error('Expected ready route state')

    const html = renderToStaticMarkup(
      <AuthContext.Provider
        value={{
          status: 'authenticated',
          session: null,
          profile,
          signInWithUsername: vi.fn(),
          reauthenticateForReset: vi.fn(),
          logout: vi.fn(),
          refreshProfile: vi.fn(),
        }}
      >
        <MemoryRouter>
          <PlayerRouteContent
            tournament={tournament}
            events={[]}
            routeState={routeState}
            onSelectDemoTeam={vi.fn()}
            onPlayDemoCard={vi.fn()}
          />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(html).toContain('PLAYER AREA')
    expect(html).toContain('Ciao Red Player 1')
    expect(html).toContain('Team Red')
    expect(html).not.toContain('view as simulator')
  })
})
