import { requireSupabase } from '../../services/supabase/client'
import type { GlobalTurn } from '../../domain/tournament/groupScheduleEngine'

export type CourtReferee = { id: string; courtId: string; name: string }

export function toScheduleRpcPayload(turns: GlobalTurn[]) {
  return turns.map((turn) => ({
    sequence: turn.sequence,
    matches: turn.matches.map((match) => ({
      group_id: match.groupId,
      court_id: match.courtId,
      team_a_id: match.teamAId,
      team_b_id: match.teamBId,
    })),
  }))
}

export function createScheduleRepository(client = requireSupabase()) {
  return {
    async listReferees(tournamentId: string): Promise<CourtReferee[]> {
      const { data, error } = await client.from('referee_court_assignments')
        .select('court_id,profiles!referee_court_assignments_referee_user_id_fkey(id,display_name)')
        .eq('tournament_id', tournamentId)
      if (error) throw new Error(`Impossibile caricare gli arbitri. ${error.message}`, { cause: error })
      return (data ?? []).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        return { id: profile.id, courtId: row.court_id, name: profile.display_name }
      })
    },
    async assignGroupCourt(tournamentId: string, groupId: string, courtId: string | null) {
      const { data, error } = await client.from('groups').update({ assigned_court_id: courtId })
        .eq('id', groupId).eq('tournament_id', tournamentId).select('id').single()
      if (error || !data) throw new Error(mapScheduleError(error?.message ?? 'group not found'), { cause: error })
    },
    async replace(tournamentId: string, turns: GlobalTurn[]) {
      const { error } = await client.rpc('replace_group_stage_schedule', {
        p_tournament_id: tournamentId,
        p_rounds: toScheduleRpcPayload(turns),
      })
      if (error) throw new Error(mapScheduleError(error.message), { cause: error })
    },
  }
}

export function mapScheduleError(message: string) {
  if (message.includes('started group-stage') || message.includes('runtime data') || message.includes('locked after')) {
    return 'Il calendario non può più essere rigenerato perché la fase a gironi è già iniziata.'
  }
  if (message.includes('assigned court') || message.includes('match court')) return 'Ogni girone deve avere un campo assegnato.'
  if (message.includes('courts must be unique')) return 'Il numero di campi deve corrispondere al numero di gironi.'
  if (message.includes('exactly one referee')) return 'Ogni campo deve avere un arbitro assegnato.'
  if (message.includes('not authorized')) return 'Non sei autorizzato a modificare il calendario.'
  return `Impossibile salvare il calendario. ${message}`
}
