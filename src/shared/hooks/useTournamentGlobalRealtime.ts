import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { dataProvider } from '../../repositories'
import { supabaseTournamentKeys } from '../../repositories/supabase/queryKeys'
import { requireSupabase } from '../../services/supabase/client'
import { subscribeToTournamentGlobalOccurrences, type GlobalRealtimeAudience } from '../../services/supabase/globalRealtime'

export function useTournamentGlobalRealtime(tournamentId: string, audience: GlobalRealtimeAudience) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (dataProvider !== 'supabase' || !tournamentId || tournamentId === 'demo-tournament' || tournamentId === 'empty-tournament') return
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournamentId) }) }
    const client = requireSupabase()
    const unsubscribe = subscribeToTournamentGlobalOccurrences(client, tournamentId, audience, occurrence => {
      if (import.meta.env.DEV) console.info(`[Presenter] ${occurrence.kind} occurrence enqueued`, occurrence)
      refresh()
    }, () => {
      if (import.meta.env.DEV) console.info(`[Realtime] reconnect/refetch tournament=${tournamentId}`)
      refresh()
    })
    const recoverVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (import.meta.env.DEV) console.info(`[Realtime] visibility recovery/refetch tournament=${tournamentId}`)
      refresh()
    }
    document.addEventListener('visibilitychange', recoverVisible)
    window.addEventListener('focus', recoverVisible)
    return () => {
      document.removeEventListener('visibilitychange', recoverVisible)
      window.removeEventListener('focus', recoverVisible)
      void unsubscribe()
    }
  }, [audience, queryClient, tournamentId])
}
