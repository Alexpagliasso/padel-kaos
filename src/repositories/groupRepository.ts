import { useQueryClient } from '@tanstack/react-query'
import { useAdminWorkspace } from '../features/admin/workspace/useAdminWorkspace'
import { useDemoStore } from '../demo/demoStore'
import { useWorkspaceStore } from '../features/admin/workspace/workspaceStore'
import { createGroupRepository } from './supabase/groupRepository'
import { supabaseTournamentKeys } from './supabase/queryKeys'
import type { GeneratedGroup } from '../domain/tournament/groupGeneration'
import type { Tournament } from '../shared/types/domain'

export function useGroupManagement() {
  const workspace = useAdminWorkspace()
  const queryClient = useQueryClient()
  const { data: tournament, entry, remote } = workspace
  async function mutate(change: (current: Tournament) => Tournament, operation: () => Promise<void>) {
    if (!entry) throw new Error('Seleziona un torneo.')
    if (remote) {
      try { await operation() }
      finally { await queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournament.id) }) }
    } else {
      const latest = useWorkspaceStore.getState().entries[tournament.id] ?? entry
      if (latest.config.started || !['draft','ready'].includes(latest.config.status)) throw new Error('I gironi non sono modificabili dopo l’avvio del torneo.')
      const source = useDemoStore.getState()
      const current = source.tournament.id === tournament.id ? source.tournament : latest.domain
      const domain = change(current)
      const updated = { ...latest, domain }
      useWorkspaceStore.setState(state => ({ entries: { ...state.entries, [tournament.id]: updated } }))
      useDemoStore.setState(state => ({ ...(state.tournament.id === tournament.id ? { tournament: domain } : {}), savedWorkspaces: { ...state.savedWorkspaces, [tournament.id]: updated } }))
    }
  }
  return {
    ...workspace,
    async replace(groups: GeneratedGroup[]) {
      await mutate(current => {
        if (current.matches.some(m => current.groups.some(g => g.id === m.groupId))) throw new Error('Non puoi rigenerare i gironi perché esistono già partite collegate.')
        const ids = groups.flatMap(g => g.teamIds)
        if (ids.length !== current.teams.length || new Set(ids).size !== ids.length || current.teams.some(t => !ids.includes(t.id))) throw new Error('Le squadre del torneo sono cambiate. Riprova.')
        const next = groups.map(g => ({ id: crypto.randomUUID(), name: g.name, tournamentId: current.id, sortOrder: g.sortOrder, assignedCourtId: null }))
        return { ...current, groups: next, teams: current.teams.map(t => ({ ...t, groupId: next[groups.findIndex(g => g.teamIds.includes(t.id))].id })) }
      }, () => createGroupRepository().replaceTournamentGroups(tournament.id, groups))
    },
    async move(teamId: string, groupId: string) {
      await mutate(current => {
        if (!current.groups.some(g => g.id === groupId) || !current.teams.some(t => t.id === teamId)) throw new Error('Squadra o girone non presenti nel torneo.')
        return { ...current, teams: current.teams.map(t => t.id === teamId ? { ...t, groupId } : t) }
      }, () => createGroupRepository().moveTeamToGroup(tournament.id, teamId, groupId))
    },
  }
}
