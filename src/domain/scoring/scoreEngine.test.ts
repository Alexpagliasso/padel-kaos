import { describe, expect, it } from 'vitest'
import { createGameState, createInitialScore, scorePoint, startNewGame } from './scoreEngine'
import type { GenderStartingScore, ScoreState } from '../../shared/types/domain'

const bonus15: GenderStartingScore = { teamA: 1, teamB: 0 }
const bonus30: GenderStartingScore = { teamA: 2, teamB: 0 }

describe('gender starting score integration', () => {
  it('creates a game point state from domain-safe bonus values', () => {
    expect(createGameState(2, 1)).toEqual({ A: '30', B: '15' })
  })

  it('applies handicap at the beginning of a new game', () => {
    const score = createInitialScore({ gameStartingScore: bonus15 })

    expect(score.points).toEqual({ A: '15', B: '0' })
  })

  it('reapplies handicap after every new game', () => {
    const initial = createInitialScore({ gameStartingScore: bonus15 })
    const afterWin = winGameFrom15Love(initial, bonus15)

    expect(afterWin.games.A).toBe(1)
    expect(afterWin.points).toEqual({ A: '15', B: '0' })
  })

  it('does not accumulate handicap across games', () => {
    const initial = createInitialScore({ gameStartingScore: bonus15 })
    const afterFirstWin = winGameFrom15Love(initial, bonus15)
    const afterSecondWin = winGameFrom15Love(afterFirstWin, bonus15)

    expect(afterSecondWin.games.A).toBe(2)
    expect(afterSecondWin.points).toEqual({ A: '15', B: '0' })
  })

  it('uses recalculated handicap when the lineup changes', () => {
    const score: ScoreState = {
      currentSet: 2,
      points: { A: '15', B: '0' },
      games: { A: 0, B: 0 },
      sets: { A: 1, B: 0 },
    }

    expect(startNewGame(score, { gameStartingScore: { teamA: 0, teamB: 2 } }).points).toEqual({
      A: '0',
      B: '30',
    })
  })

  it('plays a normal game after starting score 15-0', () => {
    const afterWin = winGameFrom15Love(createInitialScore({ gameStartingScore: bonus15 }), bonus15)

    expect(afterWin.games.A).toBe(1)
    expect(afterWin.points).toEqual({ A: '15', B: '0' })
  })

  it('plays a normal game after starting score 30-0', () => {
    let score = createInitialScore({ gameStartingScore: bonus30 })
    score = scorePoint(score, 'A', { gameStartingScore: bonus30 }).score
    score = scorePoint(score, 'A', { gameStartingScore: bonus30 }).score

    expect(score.games.A).toBe(1)
    expect(score.points).toEqual({ A: '30', B: '0' })
  })
})

function winGameFrom15Love(score: ScoreState, gameStartingScore: GenderStartingScore) {
  let next = score
  next = scorePoint(next, 'A', { gameStartingScore }).score
  next = scorePoint(next, 'A', { gameStartingScore }).score
  next = scorePoint(next, 'A', { gameStartingScore }).score
  return next
}
