import { useMutation, useQueryClient } from '@tanstack/react-query'
import { dataProvider } from '.'
import { useDemoStore } from '../demo/demoStore'
import { requireSupabase } from '../services/supabase/client'
import { supabaseTournamentKeys } from './supabase/queryKeys'

export type ConfirmLineupInput = {
  tournamentId: string
  matchId: string
  teamId: string
  setNumber: 1 | 2
  playerIds: [string, string]
}

export function useLineupRepository() {
  const queryClient = useQueryClient()
  const confirmDemo = useDemoStore(state => state.confirmLineup)
  const mutation = useMutation({
    mutationFn: async (input: ConfirmLineupInput) => {
      if (dataProvider === 'demo') {
        confirmDemo(input.matchId, input.teamId, input.setNumber, input.playerIds)
        return
      }
      await confirmSupabaseLineup(requireSupabase(), input)
    },
    onSuccess: (_, input) => queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(input.tournamentId) }),
  })
  return {
    confirm: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : '',
  }
}

export async function confirmSupabaseLineup(client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> }, input: ConfirmLineupInput) {
  const { error } = await client.rpc('confirm_match_lineup', {
    p_match_id: input.matchId,
    p_team_id: input.teamId,
    p_set_number: input.setNumber,
    p_player_1_id: input.playerIds[0],
    p_player_2_id: input.playerIds[1],
  })
  if (error) throw new Error(mapLineupError(error.message), { cause: error })
}

export function mapLineupError(message: string) {
  if (message.includes('pair already used')) return 'Questa coppia è già stata usata nella partita.'
  if (message.includes('players must be distinct')) return 'Seleziona due giocatori diversi.'
  if (message.includes('roster') || message.includes('does not belong')) return 'La formazione contiene giocatori fuori dalla rosa ufficiale.'
  if (message.includes('phase already started')) return 'La formazione non può più essere modificata perché la fase è iniziata.'
  if (message.includes('not authorized')) return 'Non sei autorizzato a modificare questa formazione.'
  return `Impossibile confermare la formazione. ${message}`
}
