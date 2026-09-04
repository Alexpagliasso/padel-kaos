import { describe, expect, it } from 'vitest'
import type { CardDefinition, TeamCard } from '../../shared/types/domain'
import {
  canPlayCardDuringRound,
  createTimedCardWindow,
  decrementGameDurationCard,
  drawRandomCardsForTeam,
  stealActiveCard,
} from './cardRules'

const deck: CardDefinition[] = [
  card('power', 'games', true),
  card('shield', 'timed', true),
  card('steal', 'instant', false),
  card('blackout', 'until_condition', true),
]

describe('card rules', () => {
  it('draws 3 unique cards when the deck allows it', () => {
    const drawn = drawRandomCardsForTeam(deck, 3, () => 0.25)

    expect(drawn).toHaveLength(3)
    expect(new Set(drawn.map((item) => item.id)).size).toBe(3)
  })

  it('blocks card play during global dice effect', () => {
    const result = canPlayCardDuringRound({
      teamId: 'team-a',
      teamCard: teamCard('tc-a', 'team-a', 'available'),
      card: deck[0],
      teamCards: [],
      isDiceEffectActive: true,
    })

    expect(result.allowed).toBe(false)
  })

  it('blocks a second persistent active card for the same team', () => {
    const result = canPlayCardDuringRound({
      teamId: 'team-a',
      teamCard: teamCard('tc-new', 'team-a', 'available'),
      card: deck[0],
      teamCards: [teamCard('tc-active', 'team-a', 'active')],
      isDiceEffectActive: false,
    })

    expect(result.allowed).toBe(false)
  })

  it('allows both teams to have an active persistent card', () => {
    const result = canPlayCardDuringRound({
      teamId: 'team-a',
      teamCard: teamCard('tc-new', 'team-a', 'available'),
      card: deck[0],
      teamCards: [teamCard('tc-active-b', 'team-b', 'active')],
      isDiceEffectActive: false,
    })

    expect(result.allowed).toBe(true)
  })

  it('creates timed card timestamps without realtime ticking', () => {
    expect(createTimedCardWindow(new Date('2026-09-03T10:00:00.000Z'), 60)).toEqual({
      activatedAt: '2026-09-03T10:00:00.000Z',
      expiresAt: '2026-09-03T10:01:00.000Z',
    })
  })

  it('decrements game duration cards and expires at zero', () => {
    expect(decrementGameDurationCard({ ...teamCard('tc', 'team-a', 'active'), remainingGames: 1 })).toMatchObject({
      remainingGames: 0,
      state: 'used',
    })
  })

  it('steals a stealable active card and preserves duration data', () => {
    const result = stealActiveCard({
      stealingTeamId: 'team-b',
      targetCard: { ...teamCard('target', 'team-a', 'active'), expiresAt: '2026-09-03T10:01:00.000Z' },
      stealCard: teamCard('steal', 'team-b', 'active'),
      targetDefinition: deck[0],
    })

    expect(result.ok).toBe(true)
    expect(result.stolenCard).toMatchObject({
      id: 'target',
      teamId: 'team-b',
      stolenFromTeamId: 'team-a',
      expiresAt: '2026-09-03T10:01:00.000Z',
    })
    expect(result.usedStealCard).toMatchObject({ state: 'used' })
  })
})

function card(id: string, durationType: CardDefinition['durationType'], canBeStolen: boolean): CardDefinition {
  return {
    id,
    name: id,
    slug: id,
    description: id,
    category: 'bonus',
    target: 'own_team',
    activationTiming: 'anytime',
    durationType,
    durationValue: 1,
    effectType: id,
    canBeStolen,
    enabled: true,
    isGlobal: false,
  }
}

function teamCard(id: string, teamId: string, state: TeamCard['state']): TeamCard {
  return {
    id,
    teamId,
    cardId: id,
    state,
  }
}
