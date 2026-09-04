import { describe, expect, it } from 'vitest'
import { createDemoTournament } from '../demo/demoSeed'
import { createEmptyTournamentDomain } from '../repositories/supabase/mappers/tournamentMapper'
import { getAdminRouteState } from './adminRouteState'

describe('getAdminRouteState', () => {
  it('handles a tournament with no matches without throwing', () => {
    const state = getAdminRouteState(createEmptyTournamentDomain(), '', { teamAId: '', teamBId: '' }, { teamId: '', cardId: '' })

    expect(state.selectedMatch).toBeUndefined()
    expect(state.canCreateMatch).toBe(false)
    expect(state.canAssignCard).toBe(false)
  })

  it('supports the populated demo contract with defined collections', () => {
    const tournament = createDemoTournament()
    const state = getAdminRouteState(
      tournament,
      tournament.matches[0].id,
      { teamAId: tournament.teams[0].id, teamBId: tournament.teams[1].id },
      { teamId: tournament.teams[0].id, cardId: tournament.cards[0].id },
    )

    expect(tournament.groups).toBeDefined()
    expect(tournament.courts).toBeDefined()
    expect(tournament.rounds).toBeDefined()
    expect(tournament.teams).toBeDefined()
    expect(tournament.matches).toBeDefined()
    expect(tournament.cards).toBeDefined()
    expect(tournament.teamCards).toBeDefined()
    expect(tournament.globalEvents).toBeDefined()
    expect(state.selectedMatch?.id).toBe(tournament.matches[0].id)
    expect(state.canCreateMatch).toBe(true)
    expect(state.canAssignCard).toBe(true)
  })
})
