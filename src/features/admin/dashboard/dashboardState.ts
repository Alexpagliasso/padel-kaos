import type { Round, Tournament } from '../../../shared/types/domain'

export function getCurrentRound(tournament: Tournament): Round | undefined {
  return tournament.rounds?.find((round) => round.status !== 'completed') ?? tournament.rounds?.[0]
}
