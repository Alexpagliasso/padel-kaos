import type { TournamentSetupConfig } from '../../../domain/tournament/tournamentTypes'
import { validateTournamentSetup } from '../../../domain/tournament/tournamentSetupEngine'
import { create } from 'zustand'
import { useDemoStore } from '../../../demo/demoStore'
import { isSupabaseProvider } from '../../../repositories'
import type { Tournament, Team } from '../../../shared/types/domain'
import type { CreateTeamInput } from '../../../demo/demoTypes'
import { demoCards } from '../../../demo/demoSeed'
import type { PresetId } from '../../../theme/tournamentPresets'

export type SetupStatus = 'draft' | 'ready' | 'live' | 'completed'
export type TournamentConfig = TournamentSetupConfig & {
  name: string
  theme: PresetId; customColor: string; status: SetupStatus; started: boolean
}
export type LibraryCard = { id: string; title: string; description: string; longDescription?: string; imageUrl: string; canBeStolen?: boolean; durationType?: 'instant' | 'timed' | 'games'; durationValue?: number | null; active: boolean }
export type LibraryEvent = { id: string; name: string; description: string; imageUrl?: string; prize?: string }
export type WorkspaceEntry = {
  domain: Tournament; config: TournamentConfig; local: boolean
  activeCards: string[]; activeEvents: string[]
  dice?: { value: number; roundId: string; rolledAt: string }
  launchedEvent?: { definition: LibraryEvent; launchedAt: string; endedAt?: string }
}
export type ReportSet = { number: number; a: number; b: number }
export type MatchReport = {
  id: string; tournamentId: string; matchId: string; court: string; teams: [string, string]
  result: string; sets: ReportSet[]; lineups: { set: number; team: string; players: string[] }[]
  cards: { team: string; title: string }[]; prizes: string[]; referee: string
  submittedAt: string; status: 'submitted' | 'approved' | 'review'; reviewNote?: string
}

export function configFromTournament(t: Tournament): TournamentConfig {
  const formTeamsCount = t.teamsCount ?? Math.max(8, t.teams.length)
  return { name: t.name, teamsCount: formTeamsCount, teamsPerGroup: t.teamsPerGroup ?? 5,
    goldQualifiedCount: t.goldQualifiedCount ?? (formTeamsCount >= 4 ? 4 : 2), silverQualifiedCount: t.silverQualifiedCount ?? (formTeamsCount >= 8 ? 4 : 0), allowByes: t.allowByes ?? true,
    courtsCount: t.courtsCount ?? Math.max(2, t.courts.length), theme: t.themePreset ?? 'blue', customColor: t.themeColor ?? '#b18cff',
    status: t.status === 'live' ? 'live' : t.status === 'completed' || t.status === 'archived' ? 'completed' : t.status === 'configured' ? 'ready' : 'draft',
    started: ['live', 'completed', 'archived'].includes(t.status ?? '') }
}
export function validateConfig(c: TournamentConfig): string[] {
  return [
    ...(!c.name.trim() ? ['Il nome del torneo è obbligatorio.'] : []),
    ...(c.theme === 'custom' && !/^#[0-9a-f]{6}$/i.test(c.customColor) ? ['Custom theme color must use #RRGGBB.'] : []),
    ...validateTournamentSetup(c).errors.map(error => error.message),
  ]
}
export function entryFromTournament(t: Tournament): WorkspaceEntry {
  return { domain: t, config: configFromTournament(t), local: false, activeCards: t.cards.filter(c => c.enabled).map(c => c.id), activeEvents: ['library-por-tres'] }
}
export function emptyTournament(id: string, name: string): Tournament {
  return { id, name, status: 'draft', teams: [], groups: [], courts: [], rounds: [], matches: [], cards: [], teamCards: [], diceRules: [], kaosEvents: [], matchEvents: [], globalEvents: [], standings: [] }
}
const initialCards: LibraryCard[] = demoCards.map(card => ({ id: card.id, title: card.name, description: card.description, longDescription: card.longDescription ?? card.description, imageUrl: '', canBeStolen: card.canBeStolen ?? false, durationType: card.durationType === 'timed' || card.durationType === 'games' ? card.durationType : 'instant', durationValue: card.durationType === 'timed' || card.durationType === 'games' ? card.durationValue : null, active: true }))
const initialEvents: LibraryEvent[] = [{ id: 'library-por-tres', name: 'Por Tres', description: 'Il primo Por Tres si aggiudica il premio.', prize: 'Premio torneo' }]
type WorkspaceState = {
  selectedId: string | null; entries: Record<string, WorkspaceEntry>; deletedIds: string[]
  cards: LibraryCard[]; events: LibraryEvent[]; reports: MatchReport[]
  select: (id: string) => void
  createTournament: (name: string) => string
  saveConfig: (entry: WorkspaceEntry, config: TournamentConfig) => string[]
  transition: (entry: WorkspaceEntry, action: 'ready' | 'start' | 'complete' | 'delete', confirmation?: string) => boolean
  addCard: (input: Omit<LibraryCard, 'id' | 'active'>) => string
  updateCard: (id: string, input: Omit<LibraryCard, 'id' | 'active'>) => void
  addEvent: (input: Omit<LibraryEvent, 'id'>) => string
  toggle: (entry: WorkspaceEntry, kind: 'cards' | 'events', id: string, active: boolean) => void
  saveTeam: (entry: WorkspaceEntry, input: CreateTeamInput, teamId?: string) => string
  setTeamRanking: (entry: WorkspaceEntry, teamId: string, ranking: number | null) => void
  assignRandomTeamRankings: (entry: WorkspaceEntry) => void
  rollDice: (entry: WorkspaceEntry, roundId: string) => void
  launchEvent: (entry: WorkspaceEntry, id: string) => void
  endEvent: (entry: WorkspaceEntry) => void
  submitReport: (report: MatchReport) => void
  reviewReport: (id: string, status: 'approved' | 'review', note?: string) => void
}
export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const current = (entry: WorkspaceEntry) => get().entries[entry.domain.id] ?? entry
  const save = (entry: WorkspaceEntry) => {
    set(state => ({ entries: { ...state.entries, [entry.domain.id]: entry } }))
    if (!isSupabaseProvider() && useDemoStore.getState().savedWorkspaces?.[entry.domain.id]) {
      useDemoStore.setState(state => ({ savedWorkspaces: { ...state.savedWorkspaces, [entry.domain.id]: entry } }))
    }
  }
  return {
    selectedId: null, entries: {}, deletedIds: [], cards: initialCards, events: initialEvents, reports: [],
    select: selectedId => set({ selectedId }),
    createTournament: name => {
      const id = `local-${crypto.randomUUID()}`
      const domain = emptyTournament(id, name.trim() || 'Nuovo torneo')
      const entry = entryFromTournament(domain)
      save({ ...entry, local: true, config: { ...entry.config, teamsCount: 8, goldQualifiedCount: 4, silverQualifiedCount: 4, courtsCount: 2 }, activeCards: initialCards.map(c => c.id) })
      set({ selectedId: id })
      return id
    },
    saveConfig: (entry, config) => {
      const latest = current(entry)
      if (latest.config.started || latest.config.status === 'live' || latest.config.status === 'completed') return ['Structural setup is locked after start.']
      const errors = validateConfig(config)
      if (errors.length) return errors
      save({ ...latest, config: { ...config, name: config.name.trim(), status: 'draft', started: false } })
      return []
    },
    transition: (entry, action, confirmation) => {
      const latest = current(entry)
      const { config } = latest
      if (action === 'delete') {
        if (config.status !== 'completed' || confirmation !== `DELETE ${config.name}`) return false
        set(state => ({ deletedIds: [...state.deletedIds, entry.domain.id], selectedId: null,
          entries: Object.fromEntries(Object.entries(state.entries).filter(([id]) => id !== entry.domain.id)),
          reports: state.reports.filter(report => report.tournamentId !== entry.domain.id) }))
        return true
      }
      if (action === 'complete') {
        if (config.status !== 'live') return false
        save({ ...latest, domain: { ...latest.domain, status: 'completed' }, config: { ...config, status: 'completed', started: true },
          launchedEvent: latest.launchedEvent ? { ...latest.launchedEvent, endedAt: new Date().toISOString() } : undefined })
        return true
      }
      if (config.started || !['draft', 'ready'].includes(config.status) || validateConfig(config).length) return false
      save({ ...latest, domain: { ...latest.domain, status: action === 'start' ? 'live' : 'configured' }, config: { ...config, status: action === 'start' ? 'live' : 'ready', started: action === 'start' } })
      return true
    },
    addCard: input => { const id = crypto.randomUUID(); set(state => ({ cards: [...state.cards, { ...input, longDescription: input.longDescription ?? input.description, canBeStolen: input.canBeStolen ?? true, durationType: input.durationType ?? 'instant', durationValue: input.durationValue ?? null, id, active: true }] })); return id },
    updateCard: (id, input) => set(state => ({ cards: state.cards.map(card => card.id === id ? { ...card, ...input } : card) })),
    addEvent: input => { const id = crypto.randomUUID(); set(state => ({ events: [...state.events, { ...input, id }] })); return id },
    toggle: (entry, kind, id, active) => {
      const latest = current(entry)
      if (latest.config.started) return
      const key = kind === 'cards' ? 'activeCards' : 'activeEvents'
      save({ ...latest, [key]: active ? [...new Set([...latest[key], id])] : latest[key].filter(value => value !== id) })
    },
    saveTeam: (entry, input, teamId) => {
      const latest = current(entry)
      if (!latest.local || latest.config.started) throw new Error('Roster is read-only.')
      if (!teamId && latest.domain.teams.length >= latest.config.teamsCount) throw new Error('Raggiunto il numero di squadre configurato.')
      const id = teamId ?? crypto.randomUUID()
      const previous = latest.domain.teams.find(team => team.id === id)
      const team: Team = { id, name: input.name, shortName: input.name.slice(0, 4).toUpperCase(), color: input.color,
        groupId: previous?.groupId ?? '', ranking: previous?.ranking ?? null, players: input.players.map((player, index) => ({ id: previous?.players[index]?.id ?? crypto.randomUUID(), teamId: id,
          name: `${player.firstName} ${player.lastName}`, nickname: player.firstName, firstName: player.firstName, lastName: player.lastName,
          gender: player.gender === 'female' ? 'woman' : 'man', accessToken: '' })) }
      save({ ...latest, domain: { ...latest.domain, teams: teamId ? latest.domain.teams.map(t => t.id === teamId ? team : t) : [...latest.domain.teams, team] } })
      return id
    },
    setTeamRanking: (entry, teamId, ranking) => {
      const latest = current(entry)
      if (!latest.local || latest.config.started || !['draft', 'ready'].includes(latest.config.status)) throw new Error('Il ranking non può essere modificato dopo l’avvio del torneo.')
      if (ranking !== null && latest.domain.teams.some(team => team.id !== teamId && team.ranking === ranking)) throw new Error(`Il ranking ${ranking} è già assegnato a un'altra squadra.`)
      save({ ...latest, domain: { ...latest.domain, teams: latest.domain.teams.map(team => team.id === teamId ? { ...team, ranking } : team) } })
    },
    assignRandomTeamRankings: (entry) => {
      const latest = current(entry)
      if (!latest.local || latest.config.started || !['draft', 'ready'].includes(latest.config.status)) throw new Error('Il ranking non può essere modificato dopo l’avvio del torneo.')
      const rankings = latest.domain.teams.map((_, index) => index + 1)
      for (let index = rankings.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1))
        ;[rankings[index], rankings[target]] = [rankings[target], rankings[index]]
      }
      save({ ...latest, domain: { ...latest.domain, teams: latest.domain.teams.map((team, index) => ({ ...team, ranking: rankings[index] })) } })
    },
    rollDice: (entry, roundId) => {
      const latest = current(entry)
      if (latest.config.status !== 'live' || !roundId) return
      save({ ...latest, dice: { roundId, value: Math.floor(Math.random() * 6) + 1, rolledAt: new Date().toISOString() } })
    },
    launchEvent: (entry, id) => {
      const latest = current(entry)
      const definition = get().events.find(e => e.id === id)
      if (!definition || !latest.activeEvents.includes(id) || latest.config.status === 'completed' || (latest.launchedEvent && !latest.launchedEvent.endedAt)) return
      save({ ...latest, launchedEvent: { definition: { ...definition }, launchedAt: new Date().toISOString() } })
    },
    endEvent: entry => { const latest = current(entry); if (latest.launchedEvent) save({ ...latest, launchedEvent: { ...latest.launchedEvent, endedAt: new Date().toISOString() } }) },
    submitReport: report => set(state => {
      const previous = state.reports.find(item => item.id === report.id)
      if (previous && previous.status !== 'review') return state
      return { reports: [...state.reports.filter(r => r.id !== report.id), report] }
    }),
    reviewReport: (id, status, note) => set(state => ({ reports: state.reports.map(report => report.id === id && report.status !== 'approved' ? { ...report, status, reviewNote: note } : report) })),
  }
})
