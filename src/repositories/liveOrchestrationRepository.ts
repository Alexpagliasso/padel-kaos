import { useMutation, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../services/supabase/client'
import { supabaseTournamentKeys } from './supabase/queryKeys'

export const defaultCardsPerTeam = 3
export const normalizeCardsPerTeam = (value: number) => Math.max(1, Math.min(10, Number.isFinite(value) ? Math.trunc(value) : 1))
export type SetControlMode = 'centralized' | 'referee'
export type SetAction = 'start_set_1' | 'end_set_1' | 'start_set_2' | 'end_set_2'

export function useLiveOrchestrationRepository(tournamentId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async ({ rpc, args }: { rpc: string; args: Record<string, unknown> }) => {
      const { data, error } = await requireSupabase().rpc(rpc, args)
      if (error) throw new Error(mapLiveError(error.message), { cause: error })
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
    controlRound: (roundId: string, action: SetAction) => call('control_round_set', { p_round_id: roundId, p_action: action }),
    controlRefereeMatch: (matchId: string, action: SetAction) => call('control_referee_match_set', { p_match_id: matchId, p_action: action }),
  }
}

export function mapLiveError(message: string) {
  if (message.includes('lineup')) return 'Impossibile avviare il set: una o più formazioni sono mancanti.'
  if (message.includes('cards already assigned')) return 'Le carte sono già state assegnate per questo turno.'
  if (message.includes('not enough enabled')) return 'Non ci sono abbastanza carte attive per completare l’assegnazione.'
  if (message.includes('after turn start') || message.includes('used cards')) return 'Le carte non possono essere riassegnate dopo l’avvio del turno.'
  if (message.includes('not authorized')) return 'Non sei autorizzato a eseguire questa operazione.'
  if (message.includes('duplicate') || message.includes('already opened')) return 'Operazione già eseguita.'
  return `Operazione live non riuscita. ${message}`
}
