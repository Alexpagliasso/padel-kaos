import { describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { getMainDisplayMode } from './mainDisplayState'

describe('main display state', () => {
  it('prioritizes global event winner over the live board', () => {
    const tournament = createDemoTournament()
    tournament.globalEvents = [{
      id: 'event-winner',
      type: 'challenge',
      title: 'POR TRES',
      description: 'First Por Tres wins',
      status: 'completed',
      winnerPlayerId: tournament.teams[0].players[0].id,
      winnerTeamId: tournament.teams[0].id,
    }]

    expect(getMainDisplayMode(tournament)).toBe('global_event_winner')
  })
})
