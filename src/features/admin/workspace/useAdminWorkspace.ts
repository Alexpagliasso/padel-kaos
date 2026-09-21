import { useDemoStore } from '../../../demo/demoStore'
import { isSupabaseProvider } from '../../../repositories'
import { useTournament } from '../../tournament/useTournament'
import { emptyTournament, entryFromTournament, useWorkspaceStore, type WorkspaceEntry } from './workspaceStore'
import { validateConfig, type TournamentConfig } from './workspaceStore'

export function projectTournament(entry: WorkspaceEntry) {
  return { ...entry.domain, name: entry.config.name,
    status: entry.config.status === 'ready' ? 'configured' as const : entry.config.status,
    courts: Array.from({ length: entry.config.courtsCount }, (_, i) => entry.domain.courts[i] ?? { id: `${entry.domain.id}-court-${i + 1}`, name: `Campo ${i + 1}` }) }
}
export function useAdminWorkspace() {
  const source = useTournament()
  const state = useWorkspaceStore()
  const saved = useDemoStore(s => s.savedWorkspaces)
  const remote = isSupabaseProvider() && source.tournaments !== undefined
  if (remote) {
    const available = (source.tournaments ?? []).map(tournament =>
      tournament.id === source.data.id ? entryFromTournament(source.data) : entryFromTournament(tournament),
    )
    const entry = available.find(item => item.domain.id === source.selectedTournamentId)
    return {
      ...source,
      source,
      entry,
      available,
      data: entry ? source.data : emptyTournament('empty-workspace', 'Nessun torneo selezionato'),
      state,
      remote: true as const,
      selectTournament: (id: string) => source.selectTournament?.(id),
      createTournament: async (name: string) => {
        if (!source.createTournament) throw new Error('Creazione torneo non disponibile')
        return source.createTournament(name)
      },
      saveTournamentConfig: async (target: WorkspaceEntry, config: TournamentConfig) => {
        const errors = validateConfig(config)
        if (errors.length) return errors
        if (!source.updateTournamentConfiguration) return ['Salvataggio torneo non disponibile.']
        try {
          await source.updateTournamentConfiguration(target.domain.id, {
            name: config.name.trim(), teamsCount: config.teamsCount, teamsPerGroup: config.teamsPerGroup,
            goldQualifiedCount: config.goldQualifiedCount, silverQualifiedCount: config.silverQualifiedCount,
            courtsCount: config.courtsCount, allowByes: config.allowByes,
            themePreset: config.theme, themeColor: config.theme === 'custom' ? config.customColor : null,
          })
          return []
        } catch (error) {
          return [error instanceof Error ? error.message : 'Impossibile salvare la configurazione del torneo.']
        }
      },
      deleteTournamentIfSafe: async (target: WorkspaceEntry) => {
        if (!source.deleteTournamentIfSafe) throw new Error('Eliminazione torneo non disponibile')
        await source.deleteTournamentIfSafe(target.domain.id)
      },
    }
  }
  const entries = { ...(!isSupabaseProvider() ? saved : {}), ...state.entries }
  const sourceEntry = entries[source.data.id] ?? entryFromTournament(source.data)
  const available = [
    { ...sourceEntry, domain: source.data },
    ...Object.values(entries).filter(entry => (entry.local || (!isSupabaseProvider() && saved?.[entry.domain.id])) && entry.domain.id !== source.data.id),
  ].filter(entry => !state.deletedIds.includes(entry.domain.id))
  const entry = available.find(item => item.domain.id === state.selectedId) ?? available[0]
  return { ...source, source, entry, available, data: entry ? projectTournament(entry) : emptyTournament('empty-workspace', 'Nessun torneo selezionato'), state,
    remote: false as const, selectTournament: (id: string) => state.select(id),
    createTournament: async (name: string) => {
      const id = state.createTournament(name)
      return entryFromTournament(useWorkspaceStore.getState().entries[id].domain)
    },
    saveTournamentConfig: (target: WorkspaceEntry, config: TournamentConfig) => state.saveConfig(target, config) }
}
