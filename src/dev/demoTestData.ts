import { useDemoStore } from '../demo/demoStore'
import type { Tournament } from '../shared/types/domain'
import { entryFromTournament, useWorkspaceStore, type WorkspaceEntry } from '../features/admin/workspace/workspaceStore'
import { projectTournament } from '../features/admin/workspace/useAdminWorkspace'

export function installDemoTestData(entry: WorkspaceEntry, tournament: Tournament) {
  const demo = useDemoStore.getState()
  const workspace = useWorkspaceStore.getState()
  const previous = workspace.entries[demo.tournament.id] ?? demo.savedWorkspaces?.[demo.tournament.id] ?? entryFromTournament(demo.tournament)
  const active = { ...entry, domain: tournament, local: false }
  const removedTeams = new Set(entry.domain.teams.filter(team => team.isTestData && !tournament.teams.includes(team)).map(team => team.id))
  const removedMatches = new Set(entry.domain.matches.filter(match => removedTeams.has(match.teamAId) || removedTeams.has(match.teamBId)).map(match => match.id))
  const oldEvents = demo.tournament.id === tournament.id ? demo.events : demo.savedEvents?.[tournament.id] ?? []
  const previousSelection = { selectedTeamId: demo.selectedTeamId, selectedMatchId: demo.selectedMatchId, selectedCourtId: demo.selectedCourtId, porTresPrizeDraft: demo.porTresPrizeDraft }
  const selection = demo.tournament.id === tournament.id ? previousSelection : demo.savedSelections?.[tournament.id]
  const events = oldEvents.filter(event => !removedTeams.has(event.teamId ?? '') && !removedMatches.has(event.matchId ?? '') && !entry.domain.teams.filter(team => removedTeams.has(team.id)).some(team => team.players.some(player => player.id === event.playerId)))
  const nextSelection = {
    selectedTeamId: tournament.teams.find(team => team.id === selection?.selectedTeamId)?.id ?? tournament.teams[0]?.id ?? '',
    selectedMatchId: tournament.matches.find(match => match.id === selection?.selectedMatchId)?.id ?? tournament.matches[0]?.id ?? '',
    selectedCourtId: tournament.courts.find(court => court.id === selection?.selectedCourtId)?.id ?? tournament.courts[0]?.id ?? '',
    porTresPrizeDraft: selection?.porTresPrizeDraft ?? '',
  }
  useDemoStore.setState({ tournament, events, ...nextSelection,
    savedSelections: { ...demo.savedSelections, [demo.tournament.id]: previousSelection, [tournament.id]: nextSelection },
    savedWorkspaces: { ...demo.savedWorkspaces, [previous.domain.id]: { ...previous, domain: demo.tournament }, [tournament.id]: active },
    savedEvents: { ...demo.savedEvents, [demo.tournament.id]: demo.events, [tournament.id]: events } })
  useWorkspaceStore.setState({ selectedId: tournament.id, entries: { ...workspace.entries, [previous.domain.id]: { ...previous, domain: demo.tournament }, [tournament.id]: active }, reports: workspace.reports.filter(report => report.tournamentId !== tournament.id || !removedMatches.has(report.matchId)) })
}

export function activateDemoTournament(id: string) {
  const demo = useDemoStore.getState()
  if (demo.tournament.id === id) return
  const entry = useWorkspaceStore.getState().entries[id] ?? demo.savedWorkspaces?.[id]
  if (!entry || !demo.savedWorkspaces?.[id]) return
  installDemoTestData(entry, projectTournament(entry))
}
