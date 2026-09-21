import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { dataProvider } from '.'
import { requireSupabase } from '../services/supabase/client'
import { supabaseTournamentKeys } from './supabase/queryKeys'

export const defaultCardsPerTeam = 3
export const normalizeCardsPerTeam = (value: number) => Math.max(1, Math.min(10, Number.isFinite(value) ? Math.trunc(value) : 1))
export type SetControlMode = 'centralized' | 'referee'
export type SetAction = 'start_set_1' | 'end_set_1' | 'start_set_2' | 'end_set_2'
export type OperationalSettings = { refereeCanManageScore:boolean;refereeCanValidateCards:boolean;refereeCanReportEventWinner:boolean;cardsEnabled:boolean;diceEnabled:boolean;specialEventsEnabled:boolean }

export function useLiveOrchestrationRepository(tournamentId: string, subscribe = true) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!subscribe || dataProvider !== 'supabase' || !tournamentId) return
    const client=requireSupabase();const refresh=()=>{void queryClient.invalidateQueries({queryKey:supabaseTournamentKeys.detail(tournamentId)})}
    const channel=client.channel(`live-orchestration:${tournamentId}:${crypto.randomUUID()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'matches',filter:`tournament_id=eq.${tournamentId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'rounds',filter:`tournament_id=eq.${tournamentId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_events',filter:`tournament_id=eq.${tournamentId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'tournament_events',filter:`tournament_id=eq.${tournamentId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_cards'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'card_usages'},refresh)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'tournaments',filter:`id=eq.${tournamentId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'global_events',filter:`tournament_id=eq.${tournamentId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'global_event_winner_reports',filter:`tournament_id=eq.${tournamentId}`},refresh)
      .subscribe()
    return ()=>{void client.removeChannel(channel)}
  },[queryClient,tournamentId,subscribe])
  const mutation = useMutation({
    mutationFn: async ({ rpc, args }: { rpc: string; args: Record<string, unknown> }) => {
      const { data, error } = await requireSupabase().rpc(rpc, args)
      if (error) {
        if (import.meta.env.DEV) console.error('Live RPC failed', { rpc, code: error.code, message: error.message, details: error.details, hint: error.hint })
        throw new Error(mapLiveError(error.message), { cause: error })
      }
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournamentId) }),
  })
  const call = (rpc: string, args: Record<string, unknown>) => mutation.mutateAsync({ rpc, args })
  return {
    isPending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : '',
    setMode: (mode: SetControlMode) => call('set_tournament_set_control_mode', { p_tournament_id: tournamentId, p_mode: mode }),
    assignCards: (roundId: string, count: number, redraw = false) => call('assign_round_cards', { p_round_id: roundId, p_cards_per_team: count, p_redraw: redraw }),
    openRound: (roundId: string) => call('open_round_for_referees', { p_round_id: roundId }),
    generateMissingLineups: (roundId: string) => call('generate_missing_round_lineups', { p_round_id: roundId }),
    rollGlobalDice: (roundId: string) => call('roll_global_dice_for_round', { p_round_id: roundId }),
    setCompletedSetResult: (matchId: string, setNumber: 1 | 2, gamesA: number, gamesB: number) => call('set_completed_match_set_result', { p_match_id: matchId, p_set_number: setNumber, p_games_a: gamesA, p_games_b: gamesB }),
    correctMatchResult: (matchId: string, setNumber: 1 | 2 | 3, scoreA: number, scoreB: number) => call('admin_correct_match_result', { p_match_id: matchId, p_set_number: setNumber, p_score_a: scoreA, p_score_b: scoreB }),
    confirmMatchResult: (matchId: string) => call('confirm_match_final_result', { p_match_id: matchId }),
    setDefaultSetDuration: (minutes: number) => call('set_tournament_default_set_duration', { p_tournament_id: tournamentId, p_minutes: minutes }),
    setRoundSetDuration: (roundId: string, minutes?: number) => call('set_round_set_duration', { p_round_id: roundId, p_minutes: minutes ?? null }),
    adminControlMatch: (matchId: string, action: SetAction) => call('admin_control_match_set', { p_match_id: matchId, p_action: action }),
    expireSet: (matchId: string) => call('expire_timed_match_set', { p_match_id: matchId }),
    setMainDisplaySettings: (mode: 'auto' | 'fixed', page: number, intervalSeconds: 4 | 5 | 8 | 10) => call('set_main_display_settings', { p_tournament_id: tournamentId, p_mode: mode, p_page: page, p_interval_seconds: intervalSeconds }),
    setDisplayCardNotifications: (enabled: boolean) => call('set_display_card_notifications', { p_tournament_id: tournamentId, p_enabled: enabled }),
    setOperationalSettings: (settings:OperationalSettings) => call('set_tournament_operational_settings',{p_tournament_id:tournamentId,p_referee_can_manage_score:settings.refereeCanManageScore,p_referee_can_validate_cards:settings.refereeCanValidateCards,p_referee_can_report_event_winner:settings.refereeCanReportEventWinner,p_cards_enabled:settings.cardsEnabled,p_dice_enabled:settings.diceEnabled,p_special_events_enabled:settings.specialEventsEnabled}),
    activateSpecialEvent: (prize: string) => call('activate_por_tres_for_tournament',{p_tournament_id:tournamentId,p_prize:prize}),
    resolveEventWinnerReport: (reportId: string) => call('resolve_global_event_winner_report',{p_report_id:reportId}),
    controlRound: (roundId: string, action: SetAction) => call('control_round_set', { p_round_id: roundId, p_action: action }),
    controlRefereeMatch: (matchId: string, action: SetAction) => call('control_referee_match_set', { p_match_id: matchId, p_action: action }),
  }
}

export function mapLiveError(message: string) {
  if (message.includes('invalid input syntax for type uuid')) return 'Correzione non riuscita per un errore nei dati. Contatta la Regia tecnica.'
  if (message.includes('authoritative dice faces are not configured')) return 'Le sei facce del dado non sono configurate per questo torneo. Contatta la Regia tecnica.'
  if (message.includes('invalid corrected result')) return 'Inserisci punteggi validi e diversi per la correzione.'
  if (message.includes('super tie-break is not required')) return 'Il Super Tie-Break non è richiesto per questa partita.'
  if (message.includes('normal set results are missing')) return 'Completa prima i risultati dei due set.'
  if (message.includes('set is not submitted')) return 'Il risultato del set non è ancora stato inviato.'
  if (message.includes('round cards incomplete')) return 'ASSEGNA LE CARTE PRIMA DI AVVIARE IL TURNO.'
  if (message.includes('previous round incomplete')) return 'Il turno successivo è bloccato: completa tutte le partite del turno precedente.'
  if (message.includes('duration is locked')) return 'NON MODIFICABILE DURANTE IL SET.'
  if (message.includes('set 1 results are incomplete') || message.includes('missing final result')) return 'Non puoi iniziare il Set 2: manca il risultato finale del Set 1.'
  if (message.includes('global dice must be rolled')) return 'Non puoi iniziare il Set 2: devi prima lanciare il dado globale.'
  if (message.includes('global dice already rolled')) return 'Il dado globale è già stato lanciato per questo turno.'
  if (message.includes('set is not completed')) return 'Il set non è ancora terminato.'
  if (message.includes('lineup')) return 'Impossibile avviare il set: una o più formazioni sono mancanti.'
  if (message.includes('cards already assigned')) return 'Le carte sono già state assegnate per questo turno.'
  if (message.includes('not enough enabled')) return 'Non ci sono abbastanza carte attive per completare l’assegnazione.'
  if (message.includes('after turn start') || message.includes('used cards')) return 'Le carte non possono essere riassegnate dopo l’avvio del turno.'
  if (message.includes('not authorized')) return 'Non sei autorizzato a eseguire questa operazione.'
  if (message.includes('duplicate') || message.includes('already opened')) return 'Operazione già eseguita.'
  return `Operazione live non riuscita. ${message}`
}
