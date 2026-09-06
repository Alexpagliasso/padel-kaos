import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requireSupabase } from '../../services/supabase/client'
import type {
  EventRepositoryContract,
  MatchRepositoryContract,
  TeamRepositoryContract,
  TournamentRepositoryContract,
} from '../contracts'
import {
  createEmptyTournamentDomain,
  mapSupabaseTournamentState,
  type SupabaseCardDefinitionRow,
  type SupabaseCourtRow,
  type SupabaseDiceRuleRow,
  type SupabaseGlobalEventRow,
  type SupabaseGroupRow,
  type SupabaseMatchCardRow,
  type SupabaseMatchEventRow,
  type SupabaseMatchLineupRow,
  type SupabaseMatchRow,
  type SupabasePlayerRow,
  type SupabaseRoundRow,
  type SupabaseTeamRow,
  type SupabaseTournamentRow,
} from './mappers/tournamentMapper'

export function useSupabaseTournamentRepository(enabled = true): TournamentRepositoryContract {
  const query = useQuery({
    queryKey: ['supabase', 'active-tournament'],
    enabled,
    queryFn: loadActiveTournament,
  })

  return {
    data: query.data ?? createEmptyTournamentDomain(query.isLoading ? 'Loading tournament' : 'No tournament configured'),
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Unable to load tournament' : undefined,
  }
}

export function useSupabaseMatchRepository(): MatchRepositoryContract {
  const queryClient = useQueryClient()
  const rpc = useMutation({
    mutationFn: async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      const client = requireSupabase()
      const { error } = await client.rpc(name, args)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supabase'] }),
  })
  const tournament = queryClient.getQueryData<ReturnType<typeof mapSupabaseTournamentState>>(['supabase', 'active-tournament'])
  const [selectedMatchId, selectedCourtId] = [
    tournament?.matches[0]?.id ?? '',
    tournament?.courts[0]?.id ?? '',
  ]

  return {
    selectedMatchId,
    selectedCourtId,
    selectMatch: () => undefined,
    selectCourt: () => undefined,
    createMatch: () => undefined,
    drawMatchCards: (matchId) => rpc.mutate({ name: 'draw_match_cards', args: { p_match_id: matchId } }),
    startMatch: (matchId) => rpc.mutate({ name: 'start_match', args: { p_match_id: matchId } }),
    endSet: (matchId) => rpc.mutate({ name: 'end_set', args: { p_match_id: matchId } }),
    startSecondSet: (matchId) => rpc.mutate({ name: 'start_second_set', args: { p_match_id: matchId } }),
    endMatch: (matchId) => rpc.mutate({ name: 'end_match', args: { p_match_id: matchId } }),
    resetMatch: () => undefined,
    scorePoint: (matchId, winner) => rpc.mutate({ name: 'record_game_won', args: { p_match_id: matchId, p_winner_side: winner } }),
    rollKaosDice: (matchId) => {
      const roundId = tournament?.matches.find((match) => match.id === matchId)?.roundId ?? matchId
      rpc.mutate({ name: 'roll_global_dice_for_round', args: { p_round_id: roundId } })
      return undefined
    },
  }
}

export function useSupabaseEventRepository(): EventRepositoryContract {
  const queryClient = useQueryClient()
  const rpc = useMutation({
    mutationFn: async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      const client = requireSupabase()
      const { error } = await client.rpc(name, args)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supabase'] }),
  })

  return {
    events: [],
    clearEvents: () => undefined,
    activatePorTres: (prize) => rpc.mutate({ name: 'activate_por_tres', args: { p_prize: prize } }),
    registerPorTres: (matchId, playerId) => {
      rpc.mutate({ name: 'claim_global_event_winner', args: { p_match_id: matchId, p_player_id: playerId } })
      return { ok: true, message: 'Por Tres claim sent.' }
    },
    porTresPrizeDraft: 'Racchetta Padel',
    setPorTresPrizeDraft: () => undefined,
  }
}

export function useSupabaseTeamRepository(): TeamRepositoryContract {
  const queryClient = useQueryClient()
  const rpc = useMutation<string, Error, { name: string; args: Record<string, unknown> }>({
    mutationFn: async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      const client = requireSupabase()
      const { data, error } = await client.rpc(name, args)
      if (error) throw error
      return data as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supabase'] }),
  })

  return {
    createTeam: (input) => rpc.mutateAsync({
      name: 'create_team_with_roster',
      args: {
        p_tournament_id: input.tournamentId,
        p_name: input.name,
        p_color: input.color,
        p_players: input.players,
      },
    }),
    updateTeam: (teamId, input) => rpc.mutateAsync({
      name: 'update_team_with_roster',
      args: {
        p_team_id: teamId,
        p_name: input.name,
        p_color: input.color,
        p_players: input.players,
      },
    }),
  }
}

async function loadActiveTournament() {
  const client = requireSupabase()
  const { data: state, error: stateError } = await client.rpc('get_active_tournament_state')
  if (stateError) throw new Error(`Unable to load tournament state: ${stateError.message}`)

  const tournament = extractFirstTournament(state)
  if (!tournament) throw new Error('No tournament found for current profile')

  const [
    groups,
    courts,
    rounds,
    teams,
    players,
    matches,
    lineups,
    cards,
    teamCards,
    diceRules,
    matchEvents,
    globalEvents,
  ] = await Promise.all([
    selectTournamentRows<SupabaseGroupRow>(client, 'groups', 'id,name,sort_order', tournament.id, 'sort_order'),
    selectTournamentRows<SupabaseCourtRow>(client, 'courts', 'id,name,sort_order', tournament.id, 'sort_order'),
    selectTournamentRows<SupabaseRoundRow>(client, 'rounds', 'id,tournament_id,name,stage,sequence,status,dice_result,dice_rule_id,dice_started_at,dice_ends_at', tournament.id, 'sequence'),
    selectTournamentRows<SupabaseTeamRow>(client, 'teams', 'id,name,short_name,color,group_id', tournament.id, 'short_name'),
    selectPlayersRows(client, tournament.id),
    selectTournamentRows<SupabaseMatchRow>(client, 'matches', 'id,round_id,group_id,court_id,team_a_id,team_b_id,status,current_set,games_a,games_b,sets_a,sets_b', tournament.id, 'created_at'),
    selectMatchScopedRows<SupabaseMatchLineupRow>(client, 'match_lineups', 'match_id,team_id,set_number,active_player_1_id,active_player_2_id,bench_player_id', tournament.id),
    selectCardDefinitions(client, tournament.id),
    selectMatchScopedRows<SupabaseMatchCardRow>(client, 'match_cards', 'id,match_id,team_id,card_definition_id,status,used_in_set,activated_at,expires_at,remaining_games,stolen_from_team_id', tournament.id),
    selectTournamentRows<SupabaseDiceRuleRow>(client, 'dice_rules', 'id,dice_value,title,description,effect_type,duration_seconds,enabled', tournament.id, 'dice_value'),
    selectTournamentRows<SupabaseMatchEventRow>(client, 'match_events', 'id,match_id,type,payload,actor_user_id,created_at', tournament.id, 'created_at'),
    selectTournamentRows<SupabaseGlobalEventRow>(client, 'global_events', 'id,type,title,description,prize,status,started_at,completed_at,winner_player_id,winner_team_id', tournament.id, 'created_at'),
  ])

  return mapSupabaseTournamentState({
    tournament,
    groups,
    courts,
    rounds,
    teams,
    players,
    matches,
    lineups,
    cards,
    teamCards,
    diceRules,
    matchEvents,
    globalEvents,
  })
}

function extractFirstTournament(state: unknown): SupabaseTournamentRow | null {
  if (!state || typeof state !== 'object' || !('tournaments' in state)) return null
  const tournaments = (state as { tournaments?: unknown }).tournaments
  if (!Array.isArray(tournaments)) return null
  const tournament = tournaments[0]
  if (!tournament || typeof tournament !== 'object' || !('id' in tournament) || !('name' in tournament)) return null
  return tournament as SupabaseTournamentRow
}

async function selectTournamentRows<T>(
  client: ReturnType<typeof requireSupabase>,
  table: string,
  columns: string,
  tournamentId: string,
  orderColumn?: string,
) {
  let query = client.from(table).select(columns).eq('tournament_id', tournamentId)
  if (orderColumn) query = query.order(orderColumn, { ascending: true })
  const { data, error } = await query
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`)
  return (data ?? []) as T[]
}

async function selectMatchScopedRows<T>(
  client: ReturnType<typeof requireSupabase>,
  table: string,
  columns: string,
  tournamentId: string,
) {
  const { data, error } = await client
    .from(table)
    .select(`${columns}, matches!inner(tournament_id)`)
    .eq('matches.tournament_id', tournamentId)
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`)
  return (data ?? []) as T[]
}

async function selectCardDefinitions(client: ReturnType<typeof requireSupabase>, tournamentId: string) {
  const { data, error } = await client
    .from('card_definitions')
    .select('id,tournament_id,name,slug,description,effect_type,target_type,duration_type,duration_value,can_be_stolen,enabled')
    .or(`tournament_id.eq.${tournamentId},tournament_id.is.null`)
    .order('slug', { ascending: true })
  if (error) throw new Error(`Unable to load card_definitions: ${error.message}`)
  return (data ?? []) as SupabaseCardDefinitionRow[]
}

async function selectPlayersRows(client: ReturnType<typeof requireSupabase>, tournamentId: string) {
  const withRosterNames = await client
    .from('players')
    .select('id,team_id,first_name,last_name,full_name,nickname,gender')
    .eq('tournament_id', tournamentId)
    .order('nickname', { ascending: true })

  if (!withRosterNames.error) return (withRosterNames.data ?? []) as SupabasePlayerRow[]
  if (!isMissingRosterNameColumnError(withRosterNames.error)) {
    throw new Error(`Unable to load players: ${withRosterNames.error.message}`)
  }

  const { data, error } = await client
    .from('players')
    .select('id,team_id,full_name,nickname,gender')
    .eq('tournament_id', tournamentId)
    .order('nickname', { ascending: true })

  if (error) throw new Error(`Unable to load players: ${error.message}`)
  return (data ?? []) as SupabasePlayerRow[]
}

function isMissingRosterNameColumnError(error: { code?: string; message?: string }) {
  return error.code === '42703'
    || error.code === 'PGRST204'
    || Boolean(error.message?.includes('first_name') || error.message?.includes('last_name'))
}
