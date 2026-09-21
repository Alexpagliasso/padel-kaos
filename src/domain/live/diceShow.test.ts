import { describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { DICE_REVEAL_MS, diceCubeRotation, diceFaces, diceShowPhase, getDiceFace, getLatestDiceReveal } from './diceShow'
import { getDiceEffect } from './readiness'

describe('authoritative dice show', () => {
  it('maps all six persisted product codes and values to the intended artwork and final face', () => {
    expect(diceFaces.map(face => face.productCode)).toEqual([
      'one_vs_one', 'three_vs_three', 'deflated_balls', 'tennis_balls', 'single_serve', 'no_glass',
    ])
    expect(new Set(diceFaces.map(face => face.artwork)).size).toBe(6)
    for (const face of diceFaces) {
      const rule = { id: `rule-${face.value}`, value: face.value, productCode: face.productCode, title: face.title, description: '', effectType: face.productCode, enabled: true }
      expect(getDiceFace(rule, face.value)).toBe(face)
      const final = diceCubeRotation(face, 5300)
      expect((final.x - face.rotation.x) % 360).toBe(0)
      expect((final.y - face.rotation.y) % 360).toBe(0)
      expect((final.z - face.rotation.z) % 360).toBe(0)
    }
    expect(getDiceFace({ id: 'wrong', value: 1, productCode: 'no_glass', title: '', description: '', effectType: '', enabled: true }, 1)).toBeUndefined()
  })

  it('reconstructs a refresh at the current phase and never replays a late join', () => {
    const rolledAt = Date.parse('2026-09-21T12:00:00.000Z')
    expect(diceShowPhase(rolledAt, rolledAt + 3000)).toBe('SPIN')
    expect(diceShowPhase(rolledAt, rolledAt + 4700)).toBe('DECELERATE')
    expect(diceShowPhase(rolledAt, rolledAt + 5300)).toBe('IMPACT')
    expect(diceShowPhase(rolledAt, rolledAt + 6000)).toBe('RULE')
    expect(diceShowPhase(rolledAt, rolledAt + DICE_REVEAL_MS)).toBe('FINISHED')
  })

  it('uses the latest persisted round result and does not mutate Set 2 or the effect clock', () => {
    const tournament = createDemoTournament()
    const round = tournament.rounds![0]
    round.diceResult = 1
    round.diceRuleId = tournament.diceRules[0].id
    round.diceRolledAt = '2026-09-21T12:00:00.000Z'
    const previous = structuredClone(tournament)
    expect(getLatestDiceReveal(tournament)?.face.value).toBe(1)
    const match = tournament.matches.find(item => item.roundId === round.id)!
    expect(getDiceEffect(tournament, match, Date.parse(round.diceRolledAt) + 9000).active).toBe(false)
    expect(match.set2StartedAt).toBeUndefined()
    expect(tournament).toEqual(previous)
  })

  it('keeps the selected face fixed when reduced motion is requested', () => {
    for (const face of diceFaces) {
      expect(diceCubeRotation(face, 1700, true)).toEqual(face.rotation)
      expect(diceCubeRotation(face, 6200, true)).toEqual(face.rotation)
    }
  })
})
