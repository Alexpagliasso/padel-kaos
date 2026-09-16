import { requireSupabase } from '../../services/supabase/client'
import type { GeneratedGroup } from '../../domain/tournament/groupGeneration'
export function createGroupRepository(client = requireSupabase()) {
  return {
    async listGroups(tournamentId: string) {
      const { data, error } = await client.from('groups').select('id,tournament_id,name,sort_order,assigned_court_id').eq('tournament_id', tournamentId).order('sort_order')
      if (error) throw groupError(error)
      return data ?? []
    },
    async replaceTournamentGroups(tournamentId: string, groups: GeneratedGroup[]) {
      const { error } = await client.rpc('replace_tournament_groups', { p_tournament_id: tournamentId, p_groups: groups.map(g => ({ name: g.name, sort_order: g.sortOrder, team_ids: g.teamIds })) })
      if (error) throw groupError(error)
    },
    async moveTeamToGroup(tournamentId: string, teamId: string, groupId: string) {
      if (!tournamentId || !teamId || !groupId) throw new Error('Torneo, squadra e girone sono obbligatori.')
      const { data, error } = await client.from('teams').update({ group_id: groupId }).eq('tournament_id', tournamentId).eq('id', teamId).select('id').single()
      if (error) throw groupError(error)
      if (!data) throw new Error('Squadra non trovata nel torneo selezionato.')
    },
  }
}
export function groupError(error: { code?: string; message: string }) {
  let message = 'Impossibile salvare i gironi. Ricarica i dati e riprova.'
  if (['40P01','40001','55P03'].includes(error.code ?? '')) message = "Un'altra modifica ai gironi è avvenuta contemporaneamente. Ricarica i dati e riprova."
  else if (error.message.includes('locked after')) message = 'I gironi non sono modificabili dopo l’avvio del torneo.'
  else if (error.message.includes('referenced by matches')) message = 'Non puoi rigenerare i gironi perché esistono già partite collegate.'
  else if (error.code === '23503') message = 'Il girone non è più disponibile o appartiene a un altro torneo. Ricarica i dati e riprova.'
  else if (error.message.includes('every tournament team') || error.message.includes('foreign tournament')) message = 'Le squadre del torneo sono cambiate. Ricarica i dati e riprova.'
  return new Error(message, { cause: error })
}
