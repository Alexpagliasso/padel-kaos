import { useTournamentRepository } from '../../repositories/tournamentRepository'

export function useTournament() {
  return useTournamentRepository()
}
