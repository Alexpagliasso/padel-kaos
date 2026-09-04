import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { scorePoint } from '../domain/scoring/scoreEngine'
import {
  buildGenderAwareLineup,
  calculateGenderStartingScore,
  canEndMatch,
  canEndSet,
  canPlayCardInMatch,
  canRollDice,
  canScorePoint,
  canStartSecondSet,
  validateLineup,
} from '../domain/rules/rulesEngine'
import { drawRandomCardsForTeam } from '../domain/rules/cardRules'
import type {
  DiceRule,
  GenderStartingScore,
  Match,
  MatchLineup,
  Team,
  TeamSide,
  Tournament,
} from '../shared/types/domain'
import { createDemoEvent, pushDemoEvent } from './demoEvents'
import { createDemoTournament } from './demoSeed'
import type {
  DemoEvent,
  DemoState,
  DemoStore,
} from './demoTypes'

const storageKey = 'padel-kaos-demo-store'
const channelName = 'padel-kaos-demo-sync'
const initialTournament = createDemoTournament()

const initialState: DemoState = {
  tournament: initialTournament,
  events: [],
  selectedTeamId: initialTournament.teams[0].id,
  selectedMatchId: initialTournament.matches[0].id,
  selectedCourtId: initialTournament.courts[0].id,
  porTresPrizeDraft: 'Racchetta Padel',
}

let applyingRemoteState = false

export const useDemoStore = create<DemoStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      resetDemo: () => {
        const tournament = createDemoTournament()
        set({
          ...initialState,
          tournament,
          selectedTeamId: tournament.teams[0].id,
          selectedMatchId: tournament.matches[0].id,
          selectedCourtId: tournament.courts[0].id,
          events: [
            createDemoEvent({
              type: 'DEMO_RESET',
              payload: { label: 'Demo reset' },
            }),
          ],
        })
      },
      loadDemoScenario: () => get().resetDemo(),
      clearEvents: () => set({ events: [] }),
      resetScores: () =>
        set((state) => {
          const tournament = {
            ...state.tournament,
            matches: state.tournament.matches.map((match) => ({
              ...match,
              status: 'ready' as const,
              score: {
                currentSet: 1,
                points: toTennisPoints(getMatchStartingScore(state.tournament, match)),
                games: { A: 0, B: 0 },
                sets: { A: 0, B: 0 },
              },
              currentKaosEventId: undefined,
            })),
            kaosEvents: [],
          }
          return { tournament }
        }),
      resetCards: () =>
        set((state) => ({
          tournament: {
            ...state.tournament,
            teamCards: state.tournament.teamCards.map((card) => ({
              ...card,
              state: 'available',
              usedInSet: undefined,
            })),
            matches: state.tournament.matches.map((match) => ({ ...match, activeCardUsageIds: [] })),
          },
        })),
      selectTeam: (teamId) => set({ selectedTeamId: teamId }),
      selectMatch: (matchId) => set({ selectedMatchId: matchId }),
      selectCourt: (courtId) => set({ selectedCourtId: courtId }),
      setPorTresPrizeDraft: (prize) => set({ porTresPrizeDraft: prize }),
      createTeam: (input) =>
        set((state) => {
          const id = `team-${slug(input.name)}-${Date.now()}`
          const team: Team = {
            id,
            name: input.name,
            shortName: input.name.slice(0, 4).toUpperCase(),
            color: input.color || '#FFD000',
            groupId: state.tournament.groups[0]?.id ?? 'demo-group-a',
            players: input.players.map((player, index) => ({
              id: `${id}-p${index + 1}`,
              name: player.name,
              nickname: player.name.split(' ')[0] || `P${index + 1}`,
              gender: player.gender,
              accessToken: `demo_${id}_${index + 1}`,
            })),
          }
          return {
            tournament: {
              ...state.tournament,
              teams: [...state.tournament.teams, team],
              standings: [
                ...state.tournament.standings,
                { teamId: team.id, played: 0, won: 0, lost: 0, points: 0 },
              ],
            },
            selectedTeamId: team.id,
          }
        }),
      createMatch: (input) =>
        set((state) => {
          const teamA = findTeam(state.tournament, input.teamAId)
          const teamB = findTeam(state.tournament, input.teamBId)
          if (!teamA || !teamB) return state
          const match: Match = {
            id: `match-${Date.now()}`,
            courtId: input.courtId,
            groupId: input.groupId ?? state.tournament.groups[0]?.id ?? 'demo-group-a',
            teamAId: input.teamAId,
            teamBId: input.teamBId,
            status: 'ready',
            score: {
              currentSet: 1,
              points: toTennisPoints(
                calculateGenderStartingScore(
                  lineupFromIds(teamA, input.teamAActivePlayerIds),
                  lineupFromIds(teamB, input.teamBActivePlayerIds),
                ),
              ),
              games: { A: 0, B: 0 },
              sets: { A: 0, B: 0 },
            },
            lineups: [
              {
                teamId: input.teamAId,
                setNumber: 1,
                activePlayerIds: input.teamAActivePlayerIds,
                benchPlayerId: getBenchPlayerId(teamA, input.teamAActivePlayerIds),
              },
              {
                teamId: input.teamBId,
                setNumber: 1,
                activePlayerIds: input.teamBActivePlayerIds,
                benchPlayerId: getBenchPlayerId(teamB, input.teamBActivePlayerIds),
              },
            ],
            activeCardUsageIds: [],
          }
          return {
            tournament: { ...state.tournament, matches: [...state.tournament.matches, match] },
            selectedMatchId: match.id,
          }
        }),
      assignCard: (teamId, cardId, matchId) =>
        set((state) => ({
          tournament: {
            ...state.tournament,
            teamCards: [
              ...state.tournament.teamCards,
              { id: `tc-${Date.now()}`, teamId, cardId, matchId, state: 'available' },
            ],
          },
        })),
      drawMatchCards: (matchId) =>
        set((state) => {
          const match = state.tournament.matches.find((item) => item.id === matchId)
          if (!match) return state
          const drawnTeamCards = [match.teamAId, match.teamBId].flatMap((teamId) =>
            drawRandomCardsForTeam(state.tournament.cards, 3).map((card, index) => ({
              id: `tc-${matchId}-${teamId}-${card.id}-${Date.now()}-${index}`,
              teamId,
              cardId: card.id,
              matchId,
              state: 'available' as const,
            })),
          )
          return {
            tournament: {
              ...state.tournament,
              teamCards: [
                ...state.tournament.teamCards.filter(
                  (card) => !(card.matchId === matchId && (card.teamId === match.teamAId || card.teamId === match.teamBId)),
                ),
                ...drawnTeamCards,
              ],
            },
            events: pushDemoEvent(
              state.events,
              createDemoEvent({ type: 'MATCH_CARDS_DRAWN', matchId, payload: { countPerTeam: 3 } }),
            ),
          }
        }),
      startMatch: (matchId) =>
        set((state) => {
          const event = createDemoEvent({ type: 'MATCH_STARTED', matchId, payload: { matchId } })
          const tournamentWithCards = ensureCardsForMatch(state.tournament, matchId)
          return {
            tournament: updateMatch(tournamentWithCards, matchId, (match) => ({
              ...match,
              status: match.score.currentSet === 2 ? 'live_set_2' : 'live_set_1',
              score: {
                ...match.score,
                points: toTennisPoints(getMatchStartingScore(tournamentWithCards, match)),
              },
            })),
            events: pushDemoEvent(state.events, event),
          }
        }),
      endSet: (matchId) =>
        set((state) => {
          const match = state.tournament.matches.find((item) => item.id === matchId)
          if (!match || !canEndSet(match).allowed) return state
          return {
            tournament: {
              ...state.tournament,
              rounds: state.tournament.rounds?.map((round) =>
                round.id === match.roundId ? { ...round, status: 'waiting_for_global_dice' } : round,
              ),
              matches: state.tournament.matches.map((item) =>
                item.roundId === match.roundId
                  ? {
                      ...item,
                      status: 'kaos_pending',
                      score: {
                        ...item.score,
                        currentSet: 2,
                        games: { A: 0, B: 0 },
                        points: { A: '0', B: '0' },
                      },
                      lineups: ensureSecondSetLineups(state.tournament, item),
                    }
                  : item,
              ),
            },
            events: pushDemoEvent(state.events, createDemoEvent({ type: 'SET_WON', matchId })),
          }
        }),
      startSecondSet: (matchId) =>
        set((state) => {
          const match = state.tournament.matches.find((item) => item.id === matchId)
          if (!match || !canStartSecondSet(match).allowed || !hasValidLineupsForSet(state.tournament, match, 2)) {
            return state
          }
          return {
            tournament: {
              ...state.tournament,
              rounds: state.tournament.rounds?.map((round) =>
                round.id === match.roundId ? { ...round, status: 'live_set_2' } : round,
              ),
              matches: state.tournament.matches.map((item) =>
                item.roundId === match.roundId
                  ? {
                      ...item,
                      status: 'live_set_2',
                      score: {
                        currentSet: 2,
                        points: toTennisPoints(getMatchStartingScore(state.tournament, item, 2)),
                        games: { A: 0, B: 0 },
                        sets: { ...item.score.sets },
                      },
                    }
                  : item,
              ),
            },
          }
        }),
      endMatch: (matchId) =>
        set((state) => {
          const match = state.tournament.matches.find((item) => item.id === matchId)
          if (!match || !canEndMatch(match).allowed) return state
          return {
            tournament: updateMatch(state.tournament, matchId, (item) => ({
              ...item,
              status: 'completed',
            })),
            events: pushDemoEvent(state.events, createDemoEvent({ type: 'MATCH_COMPLETED', matchId })),
          }
        }),
      resetMatch: (matchId) =>
        set((state) => ({
          tournament: updateMatch(state.tournament, matchId, (match) => ({
            ...match,
            status: 'ready',
            score: {
              currentSet: 1,
              points: toTennisPoints(getMatchStartingScore(state.tournament, match, 1)),
              games: { A: 0, B: 0 },
              sets: { A: 0, B: 0 },
            },
            currentKaosEventId: undefined,
            activeCardUsageIds: [],
          })),
          events: pushDemoEvent(state.events, createDemoEvent({ type: 'MATCH_RESET', matchId })),
        })),
      playCard: (teamCardId) => {
        const state = get()
        const teamCard = state.tournament.teamCards.find((card) => card.id === teamCardId)
        if (!teamCard || teamCard.state !== 'available') {
          return { ok: false, message: 'Card is not available.' }
        }
        const match = findTeamMatch(state.tournament, teamCard.teamId, teamCard.matchId)
        if (!match) return { ok: false, message: 'No match found for this card.' }
        const permission = canPlayCardInMatch(match, teamCard.teamId, state.tournament.teamCards, {
          isDiceEffectActive: isRoundDiceEffectActive(state.tournament, match),
        })
        if (!permission.allowed) return { ok: false, message: 'Puoi utilizzare una sola carta per set.' }
        const card = state.tournament.cards.find((item) => item.id === teamCard.cardId)
        set((current) => ({
          tournament: {
            ...current.tournament,
            teamCards: current.tournament.teamCards.map((item) =>
              item.id === teamCardId
                ? { ...item, state: 'pending', matchId: match.id, usedInSet: match.score.currentSet as 1 | 2 }
                : item,
            ),
          },
          events: pushDemoEvent(
            current.events,
            createDemoEvent({
              type: 'CARD_PLAYED',
              matchId: match.id,
              teamId: teamCard.teamId,
              cardId: teamCard.cardId,
              payload: { cardName: card?.name, teamName: findTeam(current.tournament, teamCard.teamId)?.name },
            }),
          ),
        }))
        return { ok: true, message: 'CARD PLAYED. Waiting for referee.' }
      },
      acknowledgeCard: (teamCardId) => {
        const state = get()
        const teamCard = state.tournament.teamCards.find((card) => card.id === teamCardId)
        if (!teamCard || teamCard.state !== 'pending') {
          return { ok: false, message: 'No pending card to acknowledge.' }
        }
        const match = findTeamMatch(state.tournament, teamCard.teamId, teamCard.matchId)
        set((current) => ({
          tournament: {
            ...current.tournament,
            teamCards: current.tournament.teamCards.map((item) =>
              item.id === teamCardId ? { ...item, state: 'active' } : item,
            ),
            matches: current.tournament.matches.map((item) =>
              item.id === match?.id
                ? { ...item, activeCardUsageIds: [...new Set([...item.activeCardUsageIds, teamCardId])] }
                : item,
            ),
          },
          events: pushDemoEvent(
            pushDemoEvent(
              current.events,
              createDemoEvent({
                type: 'CARD_ACKNOWLEDGED',
                matchId: match?.id,
                teamId: teamCard.teamId,
                cardId: teamCard.cardId,
              }),
            ),
            createDemoEvent({
              type: 'CARD_ACTIVATED',
              matchId: match?.id,
              teamId: teamCard.teamId,
              cardId: teamCard.cardId,
            }),
          ),
        }))
        return { ok: true, message: 'Card acknowledged.' }
      },
      scorePoint: (matchId, winner) =>
        set((state) => scorePointInState(state, matchId, winner)),
      rollKaosDice: (matchId) => {
        const state = get()
        const match = state.tournament.matches.find((item) => item.id === matchId)
        if (!match) return undefined
        const existing = match.currentKaosEventId
          ? state.tournament.kaosEvents.find((event) => event.id === match.currentKaosEventId)
          : undefined
        if (existing) {
          return state.tournament.diceRules.find((rule) => rule.id === existing.diceRuleId)
        }
        if (!canRollDice(match).allowed || !hasValidLineupsForSet(state.tournament, match, 2)) return undefined

        const diceValue = (Math.floor(Math.random() * 6) + 1) as DiceRule['value']
        const diceRule = state.tournament.diceRules.find((rule) => rule.value === diceValue)
        if (!diceRule) return undefined
        const startedAt = new Date()
        const kaosEvent = {
          id: `kaos-${Date.now()}`,
          matchId,
          roundId: match.roundId,
          diceRuleId: diceRule.id,
          diceValue,
          startedAt: startedAt.toISOString(),
          endsAt: new Date(startedAt.getTime() + 5 * 60 * 1000).toISOString(),
        }
        set((current) => ({
          tournament: {
            ...current.tournament,
            kaosEvents: [...current.tournament.kaosEvents, kaosEvent],
            rounds: current.tournament.rounds?.map((round) =>
              round.id === match.roundId
                ? {
                    ...round,
                    status: 'kaos_active',
                    diceResult: diceValue,
                    diceRuleId: diceRule.id,
                    diceStartedAt: kaosEvent.startedAt,
                    diceEndsAt: kaosEvent.endsAt,
                  }
                : round,
            ),
            matches: current.tournament.matches.map((item) =>
              item.roundId === match.roundId
                ? { ...item, status: 'kaos_reveal', currentKaosEventId: kaosEvent.id }
                : item,
            ),
          },
          events: pushDemoEvent(
            pushDemoEvent(
              current.events,
              createDemoEvent({
                type: 'DICE_ROLLED',
                matchId,
                payload: { value: diceValue, title: diceRule.title },
              }),
            ),
            createDemoEvent({
              type: 'KAOS_RULE_STARTED',
              matchId,
              payload: { value: diceValue, title: diceRule.title },
            }),
          ),
        }))
        return diceRule
      },
      activatePorTres: (prize) =>
        set((state) => {
          const existing = state.tournament.globalEvents.find((event) => event.type === 'challenge')
          const globalEvent = {
            id: existing?.id ?? 'global-por-tres',
            type: 'challenge' as const,
            title: 'POR TRES CHALLENGE',
            description: 'First Por Tres wins the prize.',
            status: 'active' as const,
            prize,
            startedAt: new Date().toISOString(),
          }
          return {
            tournament: {
              ...state.tournament,
              globalEvents: existing
                ? state.tournament.globalEvents.map((event) => event.id === existing.id ? globalEvent : event)
                : [...state.tournament.globalEvents, globalEvent],
            },
            events: pushDemoEvent(
              state.events,
              createDemoEvent({ type: 'GLOBAL_EVENT_STARTED', payload: { prize, title: globalEvent.title } }),
            ),
          }
        }),
      registerPorTres: (matchId, playerId) => {
        const state = get()
        const match = state.tournament.matches.find((item) => item.id === matchId)
        if (!match || match.status === 'completed') return { ok: false, message: 'Match completed.' }
        const event = state.tournament.globalEvents.find(
          (item) => item.title === 'POR TRES CHALLENGE' && item.status === 'active',
        )
        if (!event) return { ok: false, message: 'No active Por Tres challenge.' }
        if (event.winnerPlayerId) return { ok: false, message: 'Prize already awarded.' }
        const winnerTeamId = match ? getTeamIdForPlayer(state.tournament, match, playerId) : undefined
        if (!winnerTeamId) return { ok: false, message: 'Select an active player.' }
        const winnerTeam = findTeam(state.tournament, winnerTeamId)
        const winnerPlayer = winnerTeam?.players.find((player) => player.id === playerId)
        set((current) => ({
          tournament: {
            ...current.tournament,
            globalEvents: current.tournament.globalEvents.map((item) =>
              item.id === event.id
                ? {
                    ...item,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    winnerPlayerId: playerId,
                    winnerTeamId,
                  }
                : item,
            ),
          },
          events: pushDemoEvent(
            pushDemoEvent(
              current.events,
              createDemoEvent({
                type: 'POR_TRES_RECORDED',
                matchId,
                teamId: winnerTeamId,
                playerId,
              }),
            ),
            createDemoEvent({
              type: 'GLOBAL_EVENT_WON',
              matchId,
              teamId: winnerTeamId,
              playerId,
              payload: { playerName: winnerPlayer?.name, teamName: winnerTeam?.name, prize: event.prize },
            }),
          ),
        }))
        return { ok: true, message: 'Por Tres winner registered.' }
      },
    }),
    {
      name: storageKey,
      version: 1,
      storage: createJSONStorage(() => getDemoStorage()),
      partialize: (state) => ({
        tournament: state.tournament,
        events: state.events,
        selectedTeamId: state.selectedTeamId,
        selectedMatchId: state.selectedMatchId,
        selectedCourtId: state.selectedCourtId,
        porTresPrizeDraft: state.porTresPrizeDraft,
      }),
    },
  ),
)

export const demoMode = import.meta.env.VITE_DEMO_MODE !== 'false'

export function getMatchStartingScore(tournament: Tournament, match: Match, setNumber = match.score.currentSet) {
  const teamA = findTeam(tournament, match.teamAId)
  const teamB = findTeam(tournament, match.teamBId)
  const teamALineup = match.lineups.find((lineup) => lineup.teamId === match.teamAId && lineup.setNumber === setNumber)
  const teamBLineup = match.lineups.find((lineup) => lineup.teamId === match.teamBId && lineup.setNumber === setNumber)
  if (!teamA || !teamB || !teamALineup || !teamBLineup) return { teamA: 0, teamB: 0 } satisfies GenderStartingScore
  return calculateGenderStartingScore(
    buildGenderAwareLineup(teamA, teamALineup),
    buildGenderAwareLineup(teamB, teamBLineup),
  )
}

export function toTennisPoints(startingScore: GenderStartingScore) {
  return {
    A: mapBonusToPoint(startingScore.teamA),
    B: mapBonusToPoint(startingScore.teamB),
  }
}

function scorePointInState(state: DemoStore, matchId: string, winner: TeamSide): Partial<DemoStore> {
  const match = state.tournament.matches.find((item) => item.id === matchId)
  if (!match) return {}
  if (!canScorePoint(match).allowed) return {}
  const startingScore = getMatchStartingScore(state.tournament, match)
  const activePowerPoint = findActivePowerPoint(state.tournament, match, winner)
  const transitions = activePowerPoint ? 2 : 1
  let score = match.score
  const emittedTypes: DemoEvent['type'][] = ['POINT_SCORED']

  for (let index = 0; index < transitions; index += 1) {
    const result = scorePoint(score, winner, {
      gameStartingScore: startingScore,
      goldenPoint: getActiveDiceRule(state.tournament, match)?.effectType === 'golden_point',
    })
    score = result.score
    if (result.events.includes('GAME_WON')) emittedTypes.push('GAME_WON')
  }

  const teamCardUpdates = activePowerPoint
    ? state.tournament.teamCards.map((card) =>
        card.id === activePowerPoint.id ? { ...card, state: 'used' as const } : card,
      )
    : state.tournament.teamCards
  const activeIds = activePowerPoint
    ? match.activeCardUsageIds.filter((id) => id !== activePowerPoint.id)
    : match.activeCardUsageIds
  const eventPayload = { side: winner, transitions, powerPoint: Boolean(activePowerPoint) }
  const eventsToPush = emittedTypes.map((type) =>
    createDemoEvent({ type, matchId, teamId: winner === 'A' ? match.teamAId : match.teamBId, payload: eventPayload }),
  )
  if (activePowerPoint) {
    eventsToPush.push(
      createDemoEvent({
        type: 'CARD_CONSUMED',
        matchId,
        teamId: activePowerPoint.teamId,
        cardId: activePowerPoint.cardId,
      }),
    )
  }

  return {
    tournament: {
      ...state.tournament,
      teamCards: teamCardUpdates,
      matches: state.tournament.matches.map((item) =>
        item.id === matchId ? { ...item, score, status: score.currentSet > match.score.currentSet ? 'set_break' : item.status, activeCardUsageIds: activeIds } : item,
      ),
    },
    events: eventsToPush.reduce((events, event) => pushDemoEvent(events, event), state.events),
  }
}

function findActivePowerPoint(tournament: Tournament, match: Match, winner: TeamSide) {
  const winnerTeamId = winner === 'A' ? match.teamAId : match.teamBId
  return tournament.teamCards.find((teamCard) => {
    const card = tournament.cards.find((item) => item.id === teamCard.cardId)
    return (
      teamCard.teamId === winnerTeamId
      && teamCard.state === 'active'
      && match.activeCardUsageIds.includes(teamCard.id)
      && card?.effectType === 'power_point'
    )
  })
}

function getActiveDiceRule(tournament: Tournament, match: Match) {
  const round = tournament.rounds?.find((item) => item.id === match.roundId)
  if (round?.diceRuleId) return tournament.diceRules.find((rule) => rule.id === round.diceRuleId)
  const kaosEvent = tournament.kaosEvents.find((event) => event.id === match.currentKaosEventId)
  return tournament.diceRules.find((rule) => rule.id === kaosEvent?.diceRuleId)
}

function isRoundDiceEffectActive(tournament: Tournament, match: Match) {
  const round = tournament.rounds?.find((item) => item.id === match.roundId)
  if (!round?.diceEndsAt) return false
  return new Date(round.diceEndsAt).getTime() > Date.now()
}

function findTeam(tournament: Tournament, teamId: string) {
  return tournament.teams.find((team) => team.id === teamId)
}

function updateMatch(tournament: Tournament, matchId: string, updater: (match: Match) => Match): Tournament {
  return {
    ...tournament,
    matches: tournament.matches.map((match) => (match.id === matchId ? updater(match) : match)),
  }
}

function ensureCardsForMatch(tournament: Tournament, matchId: string): Tournament {
  const match = tournament.matches.find((item) => item.id === matchId)
  if (!match) return tournament
  const teams = [match.teamAId, match.teamBId]
  const alreadyValid = teams.every(
    (teamId) => tournament.teamCards.filter((card) => card.matchId === matchId && card.teamId === teamId).length === 3,
  )
  if (alreadyValid) return tournament
  const drawnTeamCards = teams.flatMap((teamId) =>
    drawRandomCardsForTeam(tournament.cards, 3).map((card, index) => ({
      id: `tc-${matchId}-${teamId}-${card.id}-${Date.now()}-${index}`,
      teamId,
      cardId: card.id,
      matchId,
      state: 'available' as const,
    })),
  )
  return {
    ...tournament,
    teamCards: [
      ...tournament.teamCards.filter(
        (card) => !(card.matchId === matchId && teams.includes(card.teamId)),
      ),
      ...drawnTeamCards,
    ],
  }
}

function findTeamMatch(tournament: Tournament, teamId: string, matchId?: string) {
  if (matchId) return tournament.matches.find((match) => match.id === matchId)
  return tournament.matches.find((match) => match.teamAId === teamId || match.teamBId === teamId)
}

function getTeamIdForPlayer(tournament: Tournament, match: Match, playerId: string) {
  const lineups = match.lineups.filter((lineup) => lineup.setNumber === match.score.currentSet)
  const activeLineup = lineups.find((lineup) => lineup.activePlayerIds.includes(playerId))
  if (!activeLineup) return undefined
  return tournament.teams.find((team) => team.id === activeLineup.teamId)?.id
}

function lineupFromIds(team: Team, activePlayerIds: [string, string]) {
  return {
    activePlayers: activePlayerIds
      .map((id) => team.players.find((player) => player.id === id))
      .filter((player): player is Team['players'][number] => Boolean(player)),
  }
}

function getBenchPlayerId(team: Team, activePlayerIds: [string, string]) {
  return team.players.find((player) => !activePlayerIds.includes(player.id))?.id ?? team.players[2].id
}

function ensureSecondSetLineups(tournament: Tournament, match: Match): MatchLineup[] {
  if (match.lineups.some((lineup) => lineup.setNumber === 2)) return match.lineups
  const teamA = findTeam(tournament, match.teamAId)
  const teamB = findTeam(tournament, match.teamBId)
  if (!teamA || !teamB) return match.lineups
  return [
    ...match.lineups,
    rotateLineup(teamA, match.lineups.find((lineup) => lineup.teamId === teamA.id && lineup.setNumber === 1)),
    rotateLineup(teamB, match.lineups.find((lineup) => lineup.teamId === teamB.id && lineup.setNumber === 1)),
  ]
}

function hasValidLineupsForSet(tournament: Tournament, match: Match, setNumber: 1 | 2) {
  const teamA = findTeam(tournament, match.teamAId)
  const teamB = findTeam(tournament, match.teamBId)
  if (!teamA || !teamB) return false
  const teamALineup = match.lineups.find((lineup) => lineup.teamId === teamA.id && lineup.setNumber === setNumber)
  const teamBLineup = match.lineups.find((lineup) => lineup.teamId === teamB.id && lineup.setNumber === setNumber)
  if (!teamALineup || !teamBLineup) return false
  const previousA = match.lineups.find((lineup) => lineup.teamId === teamA.id && lineup.setNumber === setNumber - 1)
  const previousB = match.lineups.find((lineup) => lineup.teamId === teamB.id && lineup.setNumber === setNumber - 1)
  return validateLineup(teamA, teamALineup, previousA).valid && validateLineup(teamB, teamBLineup, previousB).valid
}

function rotateLineup(team: Team, previous?: MatchLineup): MatchLineup {
  const mustEnter = previous?.benchPlayerId ?? team.players[2].id
  const partner = team.players.find((player) => player.id !== mustEnter && player.id !== previous?.activePlayerIds[0])?.id ?? team.players[0].id
  const activePlayerIds: [string, string] = [mustEnter, partner]
  return {
    teamId: team.id,
    setNumber: 2,
    activePlayerIds,
    benchPlayerId: getBenchPlayerId(team, activePlayerIds),
  }
}

function mapBonusToPoint(value: 0 | 1 | 2) {
  if (value === 2) return '30' as const
  if (value === 1) return '15' as const
  return '0' as const
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'team'
}

function getDemoStorage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    return memoryStorage
  }
  return memoryStorage
}

const memoryStorageData = new Map<string, string>()
const memoryStorage: Storage = {
  get length() {
    return memoryStorageData.size
  },
  clear: () => memoryStorageData.clear(),
  getItem: (key) => memoryStorageData.get(key) ?? null,
  key: (index) => Array.from(memoryStorageData.keys())[index] ?? null,
  removeItem: (key) => memoryStorageData.delete(key),
  setItem: (key, value) => memoryStorageData.set(key, value),
}

function setupCrossTabSync() {
  if (typeof window === 'undefined') return
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(channelName) : undefined

  useDemoStore.subscribe((state) => {
    if (applyingRemoteState) return
    channel?.postMessage({
      type: 'PADEL_KAOS_DEMO_STATE',
      state: {
        tournament: state.tournament,
        events: state.events,
        selectedTeamId: state.selectedTeamId,
        selectedMatchId: state.selectedMatchId,
        selectedCourtId: state.selectedCourtId,
        porTresPrizeDraft: state.porTresPrizeDraft,
      },
    })
  })

  channel?.addEventListener('message', (message) => {
    if (message.data?.type !== 'PADEL_KAOS_DEMO_STATE') return
    applyingRemoteState = true
    useDemoStore.setState(message.data.state)
    applyingRemoteState = false
  })

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey || !event.newValue) return
    const parsed = JSON.parse(event.newValue) as { state?: Partial<DemoState> }
    if (!parsed.state) return
    applyingRemoteState = true
    useDemoStore.setState(parsed.state)
    applyingRemoteState = false
  })
}

setupCrossTabSync()
