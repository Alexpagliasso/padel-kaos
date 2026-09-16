import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Match, Team } from '../types/domain'
import { LineupStrip } from './LineupStrip'

const team: Team = {
  id: 'team-a',
  name: 'Team A',
  shortName: 'A',
  color: '#FFD000',
  groupId: 'group-a',
  ranking: null,
  players: [
    { id: 'A', teamId: 'team-a', firstName: 'Mario', lastName: 'Rossi', name: 'Mario Rossi', nickname: 'Mario', gender: 'man', accessToken: '' },
    { id: 'B', teamId: 'team-a', firstName: 'Luca', lastName: 'Bianchi', name: 'Luca Bianchi', nickname: 'Luca', gender: 'man', accessToken: '' },
    { id: 'C', teamId: 'team-a', firstName: 'Anna', lastName: 'Verdi', name: 'Anna Verdi', nickname: 'Anna', gender: 'woman', accessToken: '' },
  ],
}

const match: Match = {
  id: 'match-1',
  courtId: 'court-1',
  groupId: 'group-a',
  teamAId: 'team-a',
  teamBId: 'team-b',
  status: 'live_set_2',
  score: { currentSet: 2, points: { A: '0', B: '0' }, games: { A: 0, B: 0 }, sets: { A: 1, B: 0 } },
  lineups: [
    { teamId: 'team-a', setNumber: 1, activePlayerIds: ['A', 'B'], benchPlayerId: 'C' },
    { teamId: 'team-a', setNumber: 2, activePlayerIds: ['A', 'C'], benchPlayerId: 'B' },
    { teamId: 'team-a', setNumber: 3, activePlayerIds: ['B', 'C'], benchPlayerId: 'A' },
  ],
  activeCardUsageIds: [],
}

describe('LineupStrip', () => {
  it('shows every configured lineup phase for admin and referee visibility', () => {
    const html = renderToStaticMarkup(<LineupStrip match={match} teamA={team} />)

    expect(html).toContain('Set 1')
    expect(html).toContain('Set 2')
    expect(html).toContain('Super Tie-break')
    expect(html).toContain('Luca')
    expect(html).toContain('Anna')
  })
})
