import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminWorkspace } from '../features/admin/workspace/useAdminWorkspace'
import { useWorkspaceStore } from '../features/admin/workspace/workspaceStore'
import { useDemoStore } from '../demo/demoStore'
import { createInitialScore } from '../domain/scoring/scoreEngine'
import type { GlobalTurn } from '../domain/tournament/groupScheduleEngine'
import type { Match, Round, Tournament } from '../shared/types/domain'
import { supabaseTournamentKeys } from './supabase/queryKeys'
import { createScheduleRepository } from './supabase/scheduleRepository'
import { loadSupabaseTournamentById } from './supabase/supabaseRepositories'

export const scheduleKeys = {
  referees: (tournamentId: string) => ['supabase', 'tournament', tournamentId, 'schedule-referees'] as const,
}

export function useScheduleManagement() {
  const workspace = useAdminWorkspace()
  const queryClient = useQueryClient()
  const { data: tournament, entry, remote } = workspace
  const refereeQuery = useQuery({
    queryKey: scheduleKeys.referees(tournament.id),
    enabled: remote && Boolean(entry),
    queryFn: () => createScheduleRepository().listReferees(tournament.id),
  })
  const referees = remote
    ? refereeQuery.data ?? []
    : tournament.courts.map((court) => ({ id: `demo-referee-${court.id}`, courtId: court.id, name: `Arbitro ${court.name}` }))

  async function refresh() {
    if (remote) await queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournament.id) })
  }

  return {
    ...workspace,
    referees,
    refereesLoading: refereeQuery.isLoading,
    refereesError: refereeQuery.error instanceof Error ? refereeQuery.error.message : '',
    async assignCourt(groupId: string, courtId: string | null) {
      if (!entry) throw new Error('Seleziona un torneo.')
      if (remote) {
        await createScheduleRepository().assignGroupCourt(tournament.id, groupId, courtId)
        await refresh()
        return
      }
      updateDemoTournament(tournament.id, (current) => ({
        ...current,
        groups: current.groups.map((group) => group.id === groupId ? { ...group, assignedCourtId: courtId } : group),
      }))
    },
    async save(turns: GlobalTurn[]) {
      if (!entry) throw new Error('Seleziona un torneo.')
      if (remote) {
        const persistedTournament = await persistAndReloadSchedule({
          tournamentId: tournament.id,
          turns,
          replace: (tournamentId, requestedTurns) => createScheduleRepository().replace(tournamentId, requestedTurns),
          load: loadSupabaseTournamentById,
        })
        queryClient.setQueryData(supabaseTournamentKeys.detail(tournament.id), persistedTournament)
        return
      }
      updateDemoTournament(tournament.id, (current) => persistDemoSchedule(current, turns))
    },
  }
}

export async function persistAndReloadSchedule(input: {
  tournamentId: string
  turns: GlobalTurn[]
  replace: (tournamentId: string, turns: GlobalTurn[]) => Promise<void>
  load: (tournamentId: string) => Promise<Tournament>
}) {
  await input.replace(input.tournamentId, input.turns)
  let persistedTournament: Tournament
  try {
    persistedTournament = await input.load(input.tournamentId)
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : ''
    throw new Error(`Impossibile caricare il calendario salvato.${detail}`, { cause })
  }
  if (!sameSchedule(persistedGroupStageTurns(persistedTournament), input.turns)) {
    throw new Error('Impossibile salvare il calendario. I dati riletti da Supabase non corrispondono al calendario generato.')
  }
  return persistedTournament
}

export function persistedGroupStageTurns(tournament: Tournament): GlobalTurn[] {
  const rounds = [...(tournament.rounds ?? [])].filter((round) => round.stage === 'group').sort((a, b) => a.sequence - b.sequence)
  const groupOrder = new Map([...tournament.groups].sort(compareGroups).map((group, index) => [group.id, index]))
  return rounds.map((round) => ({
    sequence: round.sequence,
    matches: tournament.matches
      .filter((match) => match.roundId === round.id)
      .sort((a, b) => (groupOrder.get(a.groupId) ?? 999) - (groupOrder.get(b.groupId) ?? 999))
      .map((match) => ({ groupId: match.groupId, courtId: match.courtId, teamAId: match.teamAId, teamBId: match.teamBId })),
  }))
}

function sameSchedule(left: GlobalTurn[], right: GlobalTurn[]) {
  const normalize = (turns: GlobalTurn[]) => turns
    .map((turn) => ({ sequence: turn.sequence, matches: turn.matches.map((match) =>
      `${match.groupId}:${match.courtId}:${match.teamAId}:${match.teamBId}`).sort() }))
    .sort((a, b) => a.sequence - b.sequence)
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function compareGroups(a: Tournament['groups'][number], b: Tournament['groups'][number]) {
  return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id)
}

function updateDemoTournament(tournamentId: string, change: (tournament: Tournament) => Tournament) {
  const workspaceState = useWorkspaceStore.getState()
  const entry = workspaceState.entries[tournamentId]
  const demoState = useDemoStore.getState()
  const current = demoState.tournament.id === tournamentId ? demoState.tournament : entry?.domain
  if (!current) throw new Error('Torneo non disponibile.')
  const domain = change(current)
  if (entry) useWorkspaceStore.setState((state) => ({ entries: { ...state.entries, [tournamentId]: { ...entry, domain } } }))
  useDemoStore.setState((state) => ({
    ...(state.tournament.id === tournamentId ? { tournament: domain } : {}),
    savedWorkspaces: entry ? { ...state.savedWorkspaces, [tournamentId]: { ...entry, domain } } : state.savedWorkspaces,
  }))
}

function persistDemoSchedule(tournament: Tournament, turns: GlobalTurn[]): Tournament {
  const groupRoundIds = new Set((tournament.rounds ?? []).filter((round) => round.stage === 'group').map((round) => round.id))
  const oldMatches = tournament.matches.filter((match) => groupRoundIds.has(match.roundId ?? ''))
  if (oldMatches.some((match) => match.status !== 'scheduled' || match.lineups.length > 0
    || match.score.games.A || match.score.games.B || match.score.sets.A || match.score.sets.B)) {
    throw new Error('Il calendario non può più essere rigenerato perché la fase a gironi è già iniziata.')
  }
  const rounds: Round[] = turns.map((turn) => ({ id: crypto.randomUUID(), tournamentId: tournament.id, name: `Turno ${turn.sequence}`, stage: 'group', sequence: turn.sequence, status: 'scheduled' }))
  const matches: Match[] = turns.flatMap((turn, index) => turn.matches.map((match) => ({
    id: crypto.randomUUID(), roundId: rounds[index].id, courtId: match.courtId, groupId: match.groupId,
    teamAId: match.teamAId, teamBId: match.teamBId, status: 'scheduled', score: createInitialScore(), lineups: [], activeCardUsageIds: [],
  })))
  return {
    ...tournament,
    rounds: [...(tournament.rounds ?? []).filter((round) => round.stage !== 'group'), ...rounds],
    matches: [...tournament.matches.filter((match) => !groupRoundIds.has(match.roundId ?? '')), ...matches],
  }
}
