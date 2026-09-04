import type { CardDefinition, Match, Team, Tournament } from '../shared/types/domain'

export type MatchTeamSelection = {
  teamAId: string
  teamBId: string
}

export type CardAssignmentSelection = {
  teamId: string
  cardId: string
}

export type AdminRouteState = {
  selectedMatch?: Match
  selectedTeamA?: Team
  selectedTeamB?: Team
  selectedCard?: CardDefinition
  firstCourtId?: string
  canCreateMatch: boolean
  canAssignCard: boolean
}

export function getAdminRouteState(
  tournament: Tournament,
  selectedMatchId: string,
  matchTeams: MatchTeamSelection,
  cardAssignment: CardAssignmentSelection,
): AdminRouteState {
  const selectedMatch = tournament.matches.find((match) => match.id === selectedMatchId) ?? tournament.matches[0]
  const selectedTeamA = tournament.teams.find((team) => team.id === matchTeams.teamAId) ?? tournament.teams[0]
  const selectedTeamB = tournament.teams.find((team) => team.id === matchTeams.teamBId) ?? tournament.teams.find((team) => team.id !== selectedTeamA?.id)
  const selectedCard = tournament.cards.find((card) => card.id === cardAssignment.cardId) ?? tournament.cards[0]
  const firstCourtId = tournament.courts[0]?.id

  return {
    selectedMatch,
    selectedTeamA,
    selectedTeamB,
    selectedCard,
    firstCourtId,
    canCreateMatch: Boolean(
      selectedTeamA &&
        selectedTeamB &&
        selectedTeamA.id !== selectedTeamB.id &&
        firstCourtId &&
        selectedTeamA.players[0] &&
        selectedTeamA.players[1] &&
        selectedTeamB.players[0] &&
        selectedTeamB.players[1],
    ),
    canAssignCard: Boolean(selectedMatch && selectedTeamA && selectedCard),
  }
}
