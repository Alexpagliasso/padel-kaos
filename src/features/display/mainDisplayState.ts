import type { GlobalEvent, Match, Tournament } from '../../shared/types/domain'
import { getDiceRuleForMatch } from '../tournament/selectors'

export type MainDisplayMode = 'global_event_winner' | 'global_event_start' | 'global_kaos' | 'live_board'

export function getMainDisplayMode(tournament: Tournament): MainDisplayMode {
  const globalEvent = getFeaturedGlobalEvent(tournament)
  if (globalEvent?.status === 'completed' && (globalEvent.winnerPlayerId || globalEvent.winnerTeamId)) return 'global_event_winner'
  if (globalEvent?.status === 'active') return 'global_event_start'
  if (getKaosMatch(tournament)) return 'global_kaos'
  return 'live_board'
}

export function getFeaturedGlobalEvent(tournament: Tournament): GlobalEvent | undefined {
  return tournament.globalEvents.find((event) => event.status === 'completed' && (event.winnerPlayerId || event.winnerTeamId))
    ?? tournament.globalEvents.find((event) => event.status === 'active')
}

export function getKaosMatch(tournament: Tournament): Match | undefined {
  return tournament.matches.find((match) => getDiceRuleForMatch(tournament, match))
    ?? tournament.matches.find((match) => match.status === 'kaos_event' || match.status === 'kaos_pending' || match.status === 'kaos_reveal')
}
