import type { Round, Tournament } from '../../../shared/types/domain'

export function getCurrentRound(tournament: Tournament): Round | undefined {
  const rounds=[...(tournament.rounds??[])].sort((a,b)=>a.sequence-b.sequence)
  return rounds.find((round) => round.status !== 'completed') ?? rounds.at(-1)
}
