import { beforeEach, describe, expect, it } from 'vitest'
import { useDemoStore } from './demoStore'
import { drawRandomCardsForTeam } from '../domain/rules/cardRules'
import { canScorePoint } from '../domain/rules/rulesEngine'

describe('demo store commands', () => {
  beforeEach(() => {
    useDemoStore.getState().resetDemo()
    useDemoStore.getState().clearEvents()
  })

  it('plays an available card and prevents replay while pending', () => {
    useDemoStore.getState().startMatch('match-demo-1')
    const first = useDemoStore.getState().playCard('tc-red-power')
    const second = useDemoStore.getState().playCard('tc-red-power')

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(useDemoStore.getState().tournament.teamCards.find((card) => card.id === 'tc-red-power')?.state).toBe('pending')
  })

  it('acknowledges a pending card and marks it active', () => {
    useDemoStore.getState().startMatch('match-demo-1')
    useDemoStore.getState().playCard('tc-red-power')
    const result = useDemoStore.getState().acknowledgeCard('tc-red-power')

    expect(result.ok).toBe(true)
    expect(useDemoStore.getState().tournament.teamCards.find((card) => card.id === 'tc-red-power')?.state).toBe('active')
  })

  it('Power Point applies two point transitions and is consumed afterward', () => {
    useDemoStore.getState().startMatch('match-demo-1')
    useDemoStore.getState().playCard('tc-red-power')
    useDemoStore.getState().acknowledgeCard('tc-red-power')
    useDemoStore.getState().scorePoint('match-demo-1', 'A')

    const state = useDemoStore.getState()
    const match = state.tournament.matches.find((item) => item.id === 'match-demo-1')
    const card = state.tournament.teamCards.find((item) => item.id === 'tc-red-power')

    expect(match?.score.points.A).toBe('30')
    expect(card?.state).toBe('used')
    expect(state.events.some((event) => event.type === 'CARD_CONSUMED')).toBe(true)
  })

  it('draws exactly three non duplicated cards per match team', () => {
    useDemoStore.getState().drawMatchCards('match-demo-1')
    const { tournament } = useDemoStore.getState()
    const match = tournament.matches.find((item) => item.id === 'match-demo-1')
    const teamA = tournament.teamCards.filter((card) => card.matchId === match?.id && card.teamId === match?.teamAId)
    const teamB = tournament.teamCards.filter((card) => card.matchId === match?.id && card.teamId === match?.teamBId)

    expect(teamA).toHaveLength(3)
    expect(teamB).toHaveLength(3)
    expect(new Set(teamA.map((card) => card.cardId)).size).toBe(3)
    expect(new Set(teamB.map((card) => card.cardId)).size).toBe(3)
  })

  it('pure card draw avoids duplicates when the deck allows it', () => {
    const deck = useDemoStore.getState().tournament.cards
    const drawn = drawRandomCardsForTeam(deck, 3, () => 0.42)

    expect(drawn).toHaveLength(3)
    expect(new Set(drawn.map((card) => card.id)).size).toBe(3)
  })

  it('allows only one card per team in set 1', () => {
    useDemoStore.getState().startMatch('match-demo-1')
    const first = useDemoStore.getState().playCard('tc-red-power')
    const second = useDemoStore.getState().playCard('tc-red-shield')

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(second.message).toBe('Puoi utilizzare una sola carta per set.')
  })

  it('keeps a set 1 used card used and keeps the second card available in set 2', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.playCard('tc-red-power')
    store.acknowledgeCard('tc-red-power')
    store.scorePoint('match-demo-1', 'A')
    store.endSet('match-demo-1')
    store.rollKaosDice('match-demo-1')
    store.startSecondSet('match-demo-1')

    const cards = useDemoStore.getState().tournament.teamCards

    expect(cards.find((card) => card.id === 'tc-red-power')?.state).toBe('used')
    expect(cards.find((card) => card.id === 'tc-red-power')?.usedInSet).toBe(1)
    expect(cards.find((card) => card.id === 'tc-red-shield')?.state).toBe('available')
  })

  it('blocks cards during the global dice effect and allows them after expiry', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.endSet('match-demo-1')
    store.rollKaosDice('match-demo-1')
    store.startSecondSet('match-demo-1')

    expect(useDemoStore.getState().playCard('tc-red-shield').ok).toBe(false)

    useDemoStore.setState((state) => ({
      tournament: {
        ...state.tournament,
        rounds: state.tournament.rounds?.map((round) =>
          round.id === 'round-demo-1' ? { ...round, diceEndsAt: '2026-01-01T00:00:00.000Z' } : round,
        ),
      },
    }))

    expect(useDemoStore.getState().playCard('tc-red-shield').ok).toBe(true)
  })

  it('activates Por Tres and keeps the first winner atomic', () => {
    useDemoStore.getState().activatePorTres('Racchetta Padel')
    const first = useDemoStore.getState().registerPorTres('match-demo-1', 'team-red-p1')
    const second = useDemoStore.getState().registerPorTres('match-demo-1', 'team-blue-p1')

    const event = useDemoStore.getState().tournament.globalEvents.find((item) => item.title === 'POR TRES CHALLENGE')
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(event?.winnerPlayerId).toBe('team-red-p1')
  })

  it('rolls a dice result between 1 and 6 and stores it only once', () => {
    useDemoStore.getState().startMatch('match-demo-1')
    useDemoStore.getState().endSet('match-demo-1')
    const first = useDemoStore.getState().rollKaosDice('match-demo-1')
    const second = useDemoStore.getState().rollKaosDice('match-demo-1')
    const state = useDemoStore.getState()

    expect(first?.value).toBeGreaterThanOrEqual(1)
    expect(first?.value).toBeLessThanOrEqual(6)
    expect(second?.id).toBe(first?.id)
    expect(state.tournament.kaosEvents).toHaveLength(1)
  })

  it('blocks scoring after end set 1 and before dice/start set 2', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.endSet('match-demo-1')
    const before = useDemoStore.getState().tournament.matches.find((item) => item.id === 'match-demo-1')?.score
    store.scorePoint('match-demo-1', 'A')
    const after = useDemoStore.getState().tournament.matches.find((item) => item.id === 'match-demo-1')?.score

    expect(after).toEqual(before)
    expect(canScorePoint(useDemoStore.getState().tournament.matches[0]).allowed).toBe(false)
  })

  it('does not start set 2 without dice', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.endSet('match-demo-1')
    store.startSecondSet('match-demo-1')

    expect(useDemoStore.getState().tournament.matches[0].status).toBe('kaos_pending')
  })

  it('does not start set 2 with an invalid rotation lineup', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.endSet('match-demo-1')
    store.rollKaosDice('match-demo-1')
    useDemoStore.setState((state) => ({
      tournament: {
        ...state.tournament,
        matches: state.tournament.matches.map((match) =>
          match.id === 'match-demo-1'
            ? {
                ...match,
                lineups: match.lineups.map((lineup) =>
                  lineup.teamId === match.teamAId && lineup.setNumber === 2
                    ? { ...lineup, activePlayerIds: ['team-red-p1', 'team-red-p2'], benchPlayerId: 'team-red-p3' }
                    : lineup,
                ),
              }
            : match,
        ),
      },
    }))
    store.startSecondSet('match-demo-1')

    expect(useDemoStore.getState().tournament.matches[0].status).toBe('kaos_reveal')
  })

  it('enables scoring after dice and start set 2', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.endSet('match-demo-1')
    store.rollKaosDice('match-demo-1')
    store.startSecondSet('match-demo-1')
    const match = useDemoStore.getState().tournament.matches[0]

    expect(match.status).toBe('live_set_2')
    expect(canScorePoint(match).allowed).toBe(true)
  })

  it('recalculates gender handicap at the beginning of set 2', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.endSet('match-demo-1')
    store.rollKaosDice('match-demo-1')
    store.startSecondSet('match-demo-1')

    expect(useDemoStore.getState().tournament.matches[0].score.points).toEqual({ A: '0', B: '15' })
  })

  it('end match blocks points, cards and dice', () => {
    const store = useDemoStore.getState()
    store.startMatch('match-demo-1')
    store.endMatch('match-demo-1')
    const before = useDemoStore.getState().tournament.matches[0].score
    store.scorePoint('match-demo-1', 'A')
    const card = store.playCard('tc-red-power')
    const dice = store.rollKaosDice('match-demo-1')

    expect(useDemoStore.getState().tournament.matches[0].score).toEqual(before)
    expect(card.ok).toBe(false)
    expect(dice).toBeUndefined()
  })
})
