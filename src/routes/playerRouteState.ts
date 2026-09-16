import type { AppProfile } from '../features/auth/authIdentity'
import { getTeam } from '../features/tournament/selectors'
import { getPlayerDisplayName } from '../shared/lib/playerNames'
import type { Match, Team, TeamCard, Tournament } from '../shared/types/domain'

export type PlayerRouteState =
  | { type: 'loading' }
  | { type: 'error'; title: string; message: string }
  | {
      type: 'ready'
      playerTeam: Team
      match: Match
      matches: Match[]
      teamA?: Team
      teamB?: Team
      cards: TeamCard[]
      greetingName: string
      showDemoTeamSelector: boolean
    }

export function resolvePlayerRouteState(input: {
  provider: 'demo' | 'supabase'
  tournament: Tournament
  isLoading?: boolean
  repositoryError?: string
  profile?: AppProfile | null
  demoSelectedTeamId: string
}): PlayerRouteState {
  if (input.isLoading) return { type: 'loading' }
  if (input.repositoryError) {
    return { type: 'error', title: 'Impossibile caricare le partite', message: input.repositoryError }
  }

  const teamId = resolvePlayerTeamId(input.provider, input.profile, input.demoSelectedTeamId)
  if (!teamId) {
    return {
      type: 'error',
      title: 'Profilo squadra mancante',
      message: 'Questo account non è associato a una squadra.',
    }
  }

  const playerTeam = getTeam(input.tournament, teamId)
  if (!playerTeam) {
    return {
      type: 'error',
      title: 'Squadra non trovata',
      message: 'La squadra associata a questo account non è configurata nel torneo.',
    }
  }

  if (playerTeam.players.length === 0) {
    return {
      type: 'error',
      title: 'Nessun giocatore configurato',
      message: `${playerTeam.name} non ha ancora giocatori configurati.`,
    }
  }

  const matches = input.tournament.matches
    .filter((item) => item.teamAId === playerTeam.id || item.teamBId === playerTeam.id)
    .sort((a, b) => {
      const completionOrder = Number(a.status === 'completed') - Number(b.status === 'completed')
      if (completionOrder) return completionOrder
      const aSequence = input.tournament.rounds?.find(round => round.id === a.roundId)?.sequence ?? Number.MAX_SAFE_INTEGER
      const bSequence = input.tournament.rounds?.find(round => round.id === b.roundId)?.sequence ?? Number.MAX_SAFE_INTEGER
      return aSequence - bSequence
    })
  const match = matches[0]
  if (!match) {
    return {
      type: 'error',
      title: 'Nessuna partita programmata',
      message: `${playerTeam.name} non è ancora assegnata a una partita del torneo.`,
    }
  }

  return {
    type: 'ready',
    playerTeam,
    match,
    matches,
    teamA: getTeam(input.tournament, match.teamAId),
    teamB: getTeam(input.tournament, match.teamBId),
    cards: input.tournament.teamCards.filter((teamCard) => teamCard.teamId === playerTeam.id),
    greetingName: playerTeam.players[0] ? getPlayerDisplayName(playerTeam.players[0]) : playerTeam.shortName,
    showDemoTeamSelector: input.provider === 'demo',
  }
}

function resolvePlayerTeamId(provider: 'demo' | 'supabase', profile: AppProfile | null | undefined, demoSelectedTeamId: string) {
  if (provider === 'demo') return demoSelectedTeamId
  return profile?.role === 'team' ? profile.teamId ?? '' : ''
}
