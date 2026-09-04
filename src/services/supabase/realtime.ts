import { requireSupabase } from './client'

export function subscribeToMatch(matchId: string, onChange: () => void) {
  const client = requireSupabase()
  return client
    .channel(`match:${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, onChange)
    .subscribe()
}

export function subscribeToTournament(tournamentId: string, onChange: () => void) {
  const client = requireSupabase()
  return client
    .channel(`tournament:${tournamentId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_cards' }, onChange)
    .subscribe()
}

export function subscribeToRoundGlobal(roundId: string, onChange: () => void) {
  const client = requireSupabase()
  return client
    .channel(`round:${roundId}:global`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `round_id=eq.${roundId}` }, onChange)
    .subscribe()
}

export function subscribeToGlobalEvents(tournamentId: string, onChange: () => void) {
  const client = requireSupabase()
  return client
    .channel(`global-events:${tournamentId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'global_events', filter: `tournament_id=eq.${tournamentId}` }, onChange)
    .subscribe()
}
