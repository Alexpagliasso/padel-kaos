import { describe, expect, it } from 'vitest'
import type { GenderAwareLineup } from './rulesEngine'
import {
  calculateGenderStartingScore,
  getAvailablePairs,
  getRemainingPair,
  isPairAlreadyUsed,
  isSamePair,
  normalizePair,
  validateMatchLineup,
} from './rulesEngine'

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

describe('match lineup pair rules', () => {
  const roster = [
    { id: 'A' },
    { id: 'B' },
    { id: 'C' },
  ]
  const usedAB = [{ activePlayerIds: ['A', 'B'] as [string, string] }]
  const usedABAC = [
    { activePlayerIds: ['A', 'B'] as [string, string] },
    { activePlayerIds: ['A', 'C'] as [string, string] },
  ]

  it('genera esattamente AB, AC e BC', () => {
    expect(getAvailablePairs(roster, [])).toEqual([['A', 'B'], ['A', 'C'], ['B', 'C']])
  })

  it('confronta le coppie senza considerare l’ordine', () => {
    expect(isSamePair(['A', 'B'], ['B', 'A'])).toBe(true)
    expect(isSamePair(['A', 'B'], ['A', 'C'])).toBe(false)
  })

  it.each([
    ['A', 'B', 'B', 'A'],
    ['A', 'C', 'C', 'A'],
    ['B', 'C', 'C', 'B'],
  ])('normalizes %s+%s and %s+%s as the same pair', (firstA, firstB, secondA, secondB) => {
    expect(normalizePair(firstA, firstB)).toBe(normalizePair(secondA, secondB))
  })

  it('allows any roster pair for the first set', () => {
    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['A', 'B'] },
      usedLineups: [],
      roster,
    })).toEqual({ valid: true })
  })

  it('rejects a repeated pair in the second set regardless of order', () => {
    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['A', 'B'] },
      usedLineups: usedAB,
      roster,
    })).toMatchObject({ valid: false })

    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['B', 'A'] },
      usedLineups: usedAB,
      roster,
    })).toMatchObject({ valid: false })
  })

  it('allows the two unused second-set pairs after A+B', () => {
    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['A', 'C'] },
      usedLineups: usedAB,
      roster,
    })).toEqual({ valid: true })

    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['B', 'C'] },
      usedLineups: usedAB,
      roster,
    })).toEqual({ valid: true })
  })

  it('allows only the remaining pair in the super tie-break', () => {
    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['B', 'C'] },
      usedLineups: usedABAC,
      roster,
    })).toEqual({ valid: true })

    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['A', 'B'] },
      usedLineups: usedABAC,
      roster,
    })).toMatchObject({ valid: false })

    expect(validateMatchLineup({
      candidate: { activePlayerIds: ['A', 'C'] },
      usedLineups: usedABAC,
      roster,
    })).toMatchObject({ valid: false })
  })

  it('returns the unique remaining pair', () => {
    expect(getRemainingPair(roster, usedABAC)).toEqual(['B', 'C'])
    expect(getAvailablePairs(roster, usedABAC)).toEqual([['B', 'C']])
  })

  it('detects whether a pair was already used', () => {
    expect(isPairAlreadyUsed({ activePlayerIds: ['B', 'A'] }, usedAB)).toBe(true)
    expect(isPairAlreadyUsed({ activePlayerIds: ['B', 'C'] }, usedAB)).toBe(false)
  })

  it.each([
    [['A', 'X'], 'La lineup contiene giocatori fuori squadra.'],
    [['A', 'A'], 'I 2 giocatori in campo devono essere diversi.'],
    [['A'], 'La lineup deve contenere esattamente 2 giocatori.'],
    [['A', 'B', 'C'], 'La lineup deve contenere esattamente 2 giocatori.'],
  ])('rejects invalid candidate %o', (activePlayerIds, reason) => {
    expect(validateMatchLineup({
      candidate: { activePlayerIds },
      usedLineups: [],
      roster,
    })).toEqual({ valid: false, reason })
  })
})
