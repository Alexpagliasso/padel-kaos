import type { GlobalEvent, Match, Round, Tournament } from '../../../shared/types/domain'

export function getControlRoomRound(tournament: Tournament): Round | undefined {
  return tournament.rounds?.find((round) => round.status !== 'completed') ?? tournament.rounds?.[0]
}

export function getCurrentRoundMatches(tournament: Tournament, round?: Round): Match[] {
  if (!round) return tournament.matches
  const roundMatches = tournament.matches.filter((match) => match.roundId === round.id)
  return roundMatches.length > 0 ? roundMatches : tournament.matches
}

export function getGlobalKaosStatus(round?: Round): 'NOT STARTED' | 'WAITING' | 'ACTIVE' | 'COMPLETED' {
  if (!round) return 'NOT STARTED'
  if (round.status === 'completed') return 'COMPLETED'
  if (round.status === 'waiting_for_global_dice') return 'WAITING'
  if (round.status === 'kaos_active' || round.diceResult) return 'ACTIVE'
  return 'NOT STARTED'
}

export function getPorTresEvent(tournament: Tournament): GlobalEvent | undefined {
  return tournament.globalEvents.find((event) => event.type === 'challenge' || event.title.toUpperCase().includes('POR TRES'))
}
