import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { dataProvider } from '.'
import { requireSupabase } from '../services/supabase/client'
import { supabaseTournamentKeys } from './supabase/queryKeys'

type LiveOperation =
  | { type: 'game'; matchId: string; teamId: string }
  | { type: 'score'; matchId: string; gamesA: number; gamesB: number }
  | { type: 'request'; matchCardId: string }
  | { type: 'confirm'; matchCardId: string; selectedPlayerId?: string }
  | { type: 'reject'; matchCardId: string }
  | { type: 'super_tiebreak'; matchId: string; scoreA: number; scoreB: number }
  | { type: 'confirm_result'; matchId: string }
  | { type: 'report_event'; matchId: string; playerId: string }
  | { type: 'save_set_result'; matchId: string; setNumber: 1 | 2; gamesA: number; gamesB: number }
  | { type: 'submit_set_result'; matchId: string; setNumber: 1 | 2 }
  | { type: 'expire_set'; matchId: string }

export function useLiveMatchRepository(tournamentId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (operation: LiveOperation) => {
      if (dataProvider === 'demo') return operation
      const client = requireSupabase()
      const request = operation.type === 'game'
        ? ['increment_match_set_game', { p_match_id: operation.matchId, p_team_id: operation.teamId }] as const
        : operation.type === 'score'
          ? ['set_match_set_score', { p_match_id: operation.matchId, p_games_a: operation.gamesA, p_games_b: operation.gamesB }] as const
          : operation.type === 'request'
            ? ['request_match_card_use', { p_match_card_id: operation.matchCardId }] as const
            : operation.type === 'confirm'
              ? ['confirm_match_card_use', { p_match_card_id: operation.matchCardId, p_selected_player_id: operation.selectedPlayerId ?? null }] as const
              : operation.type === 'reject'
                ? ['reject_match_card_use', { p_match_card_id: operation.matchCardId }] as const
                : operation.type === 'super_tiebreak'
                  ? ['set_match_super_tiebreak_score', { p_match_id: operation.matchId, p_score_a: operation.scoreA, p_score_b: operation.scoreB }] as const
                  : operation.type === 'confirm_result'
                    ? ['confirm_match_final_result', { p_match_id: operation.matchId }] as const
                    : operation.type === 'report_event'
                      ? ['report_global_event_winner', { p_match_id: operation.matchId, p_player_id: operation.playerId }] as const
                      : operation.type === 'save_set_result'
                        ? ['save_completed_match_set_result', { p_match_id: operation.matchId, p_set_number: operation.setNumber, p_games_a: operation.gamesA, p_games_b: operation.gamesB }] as const
                        : operation.type === 'submit_set_result'
                          ? ['submit_completed_match_set_result', { p_match_id: operation.matchId, p_set_number: operation.setNumber }] as const
                          : ['expire_timed_match_set', { p_match_id: operation.matchId }] as const
      const { error } = await client.rpc(request[0], request[1])
      if (error) throw new Error(mapLiveMatchError(error.message), { cause: error })
      return operation
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournamentId) }),
  })

  useEffect(() => {
    if (dataProvider !== 'supabase' || !tournamentId) return
    const client = requireSupabase()
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournamentId) }) }
    const channel = client.channel(`live-match:${tournamentId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_events', filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_cards' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_usages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_lineups' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_events', filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_event_winner_reports', filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [queryClient, tournamentId])

  return {
    isPending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : '',
    incrementGame: (matchId: string, teamId: string) => mutation.mutateAsync({ type: 'game', matchId, teamId }),
    setScore: (matchId: string, gamesA: number, gamesB: number) => mutation.mutateAsync({ type: 'score', matchId, gamesA, gamesB }),
    requestCard: (matchCardId: string) => mutation.mutateAsync({ type: 'request', matchCardId }),
    confirmCard: (matchCardId: string, selectedPlayerId?: string) => mutation.mutateAsync({ type: 'confirm', matchCardId, selectedPlayerId }),
    rejectCard: (matchCardId: string) => mutation.mutateAsync({ type: 'reject', matchCardId }),
    setSuperTiebreakScore: (matchId: string, scoreA: number, scoreB: number) => mutation.mutateAsync({ type: 'super_tiebreak', matchId, scoreA, scoreB }),
    confirmResult: (matchId: string) => mutation.mutateAsync({ type: 'confirm_result', matchId }),
    reportEventWinner: (matchId: string, playerId: string) => mutation.mutateAsync({ type: 'report_event', matchId, playerId }),
    saveSetResult: (matchId: string, setNumber: 1 | 2, gamesA: number, gamesB: number) => mutation.mutateAsync({ type: 'save_set_result', matchId, setNumber, gamesA, gamesB }),
    submitSetResult: (matchId: string, setNumber: 1 | 2) => mutation.mutateAsync({ type: 'submit_set_result', matchId, setNumber }),
    expireSet: (matchId: string) => mutation.mutateAsync({ type: 'expire_set', matchId }),
  }
}

export function mapLiveMatchError(message: string) {
  if (message.includes('deadline has not elapsed')) return 'Il tempo del set non è ancora scaduto.'
  if (message.includes('requires admin correction')) return 'Il risultato confermato può essere corretto solo dalla Regia.'
  if (message.includes('not authorized for court')) return 'Non sei assegnato a questo campo.'
  if (message.includes('set is not active') || message.includes('match is not live')) return 'Il set non è ancora iniziato.'
  if (message.includes('card not available')) return 'La carta non è più utilizzabile.'
  if (message.includes('card is not pending')) return 'Questa richiesta è già stata gestita.'
  if (message.includes('selected player')) return 'Il giocatore selezionato non è nella formazione attiva.'
  if (message.includes('dice')) return 'Le carte non sono utilizzabili durante l’effetto del dado.'
  if (message.includes('active persistent')) return 'La squadra ha già una carta attiva.'
  if (message.includes('not authorized')) return 'Non sei autorizzato a eseguire questa operazione.'
  if (message.includes('invalid game score')) return 'Il punteggio inserito non è valido.'
  return 'Il dato è stato modificato da un altro dispositivo. Aggiorna e riprova.'
}
