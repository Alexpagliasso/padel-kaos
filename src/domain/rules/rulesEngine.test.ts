import { describe, expect, it } from 'vitest'
import type { GenderAwareLineup } from './rulesEngine'
import { calculateGenderStartingScore } from './rulesEngine'

function lineup(womenCount: 0 | 1 | 2): GenderAwareLineup {
  return {
    activePlayers: [
      { id: 'p1', gender: womenCount >= 1 ? 'woman' : 'man' },
      { id: 'p2', gender: womenCount >= 2 ? 'woman' : 'man' },
    ],
  }
}

describe('calculateGenderStartingScore', () => {
  it.each([
    [0, 0, { teamA: 0, teamB: 0 }],
    [0, 1, { teamA: 0, teamB: 1 }],
    [0, 2, { teamA: 0, teamB: 2 }],
    [1, 0, { teamA: 1, teamB: 0 }],
    [1, 1, { teamA: 0, teamB: 0 }],
    [1, 2, { teamA: 0, teamB: 1 }],
    [2, 0, { teamA: 2, teamB: 0 }],
    [2, 1, { teamA: 1, teamB: 0 }],
    [2, 2, { teamA: 0, teamB: 0 }],
  ] as const)('%i women vs %i women returns %o', (teamAWomen, teamBWomen, expected) => {
    expect(calculateGenderStartingScore(lineup(teamAWomen), lineup(teamBWomen))).toEqual(expected)
  })

  it('recalculates the handicap after lineup changes', () => {
    const firstSet = calculateGenderStartingScore(lineup(1), lineup(0))
    const secondSet = calculateGenderStartingScore(lineup(0), lineup(2))

    expect(firstSet).toEqual({ teamA: 1, teamB: 0 })
    expect(secondSet).toEqual({ teamA: 0, teamB: 2 })
  })
})
