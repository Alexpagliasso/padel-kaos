import type { Match, Team, Tournament } from '../../shared/types/domain'

export function getTeam(tournament: Tournament, teamId: string) {
  return tournament.teams.find((team) => team.id === teamId)
}

export function getCourt(tournament: Tournament, courtId: string) {
  return tournament.courts.find((court) => court.id === courtId)
}

export function getCurrentLineups(match: Match) {
  return match.lineups.filter((lineup) => lineup.setNumber === match.score.currentSet)
}

export function getPlayerName(team: Team | undefined, playerId: string) {
  return team?.players.find((player) => player.id === playerId)?.nickname ?? 'TBD'
}

export function getDiceRuleForMatch(tournament: Tournament, match: Match) {
  const round = tournament.rounds?.find((item) => item.id === match.roundId)
  if (round?.diceRuleId) return tournament.diceRules.find((rule) => rule.id === round.diceRuleId)
  const kaosEvent = tournament.kaosEvents.find((event) => event.id === match.currentKaosEventId)
  return tournament.diceRules.find((rule) => rule.id === kaosEvent?.diceRuleId)
}
