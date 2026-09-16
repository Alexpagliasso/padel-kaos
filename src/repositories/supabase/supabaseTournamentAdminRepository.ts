import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  TournamentAdminRepositoryContract,
  TournamentConfigurationInput,
} from '../contracts'
import type { Tournament } from '../../shared/types/domain'
import { requireSupabase } from '../../services/supabase/client'
import {
  mapSupabaseTournamentState,
  type SupabaseTournamentRow,
} from './mappers/tournamentMapper'
import { loadSupabaseTournamentById } from './supabaseRepositories'

export const tournamentColumns = 'id,name,phase,status,teams_count,teams_per_group,gold_qualified_count,silver_qualified_count,courts_count,allow_byes,theme_preset,theme_color,created_at,updated_at'

type RepositoryDependencies = {
  client: SupabaseClient
  loadById: (tournamentId: string) => Promise<Tournament>
}

export function createSupabaseTournamentAdminRepository(
  dependencies: Partial<RepositoryDependencies> = {},
): TournamentAdminRepositoryContract {
  const client = dependencies.client ?? requireSupabase()
  const loadById = dependencies.loadById ?? ((id: string) => loadSupabaseTournamentById(id, client))

  const getTournament = async (tournamentId: string) => {
    requireTournamentId(tournamentId)
    return loadById(tournamentId)
  }

  return {
    listTournaments: async () => {
      const { data, error } = await client.from('tournaments').select(tournamentColumns).order('created_at', { ascending: true })
      if (error) throw repositoryError('Unable to list tournaments', error)
      return ((data ?? []) as unknown as SupabaseTournamentRow[]).map(mapTournamentRow)
    },
    getTournament,
    createTournament: async (name) => {
      const normalizedName = name.trim()
      if (!normalizedName) throw new Error('Tournament name is required')
      // Applied SQL verification documents the exact argument as p_name. The
      // implementation tolerates either a UUID or returned tournament row.
      const { data, error } = await client.rpc('create_tournament_for_admin', { p_name: normalizedName })
      if (error) throw repositoryError('Unable to create tournament', error)
      return getTournament(extractCreatedTournamentId(data))
    },
    updateTournamentConfiguration: async (tournamentId, input) => {
      requireTournamentId(tournamentId)
      const { error } = await client.rpc('update_tournament_configuration_with_courts', configurationRpcArgs(tournamentId, input))
      if (error) throw repositoryError('Impossibile aggiornare la configurazione e i campi del torneo', error)
      return getTournament(tournamentId)
    },
    deleteTournamentIfSafe: async (tournamentId) => {
      requireTournamentId(tournamentId)
      const { error } = await client.rpc('delete_tournament_if_safe', { p_tournament_id: tournamentId })
      if (error) throw repositoryError('Unable to delete tournament', error)
    },
  }
}

function mapTournamentRow(row: SupabaseTournamentRow) {
  return mapSupabaseTournamentState({ tournament: row })
}

function configurationRpcArgs(tournamentId: string, input: TournamentConfigurationInput) {
  return {
    p_tournament_id: tournamentId,
    p_name: input.name,
    p_teams_count: input.teamsCount,
    p_teams_per_group: input.teamsPerGroup,
    p_gold_qualified_count: input.goldQualifiedCount,
    p_silver_qualified_count: input.silverQualifiedCount,
    p_courts_count: input.courtsCount,
    p_allow_byes: input.allowByes,
    p_theme_preset: input.themePreset,
    p_theme_color: input.themeColor,
  }
}

function extractCreatedTournamentId(data: unknown) {
  const value = Array.isArray(data) ? data[0] : data
  if (typeof value === 'string' && value.trim()) return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id.trim()) return value.id
  throw new Error('Tournament creation returned no tournament ID')
}

function requireTournamentId(tournamentId: string) {
  if (!tournamentId.trim()) throw new Error('Tournament ID is required')
}

function repositoryError(context: string, error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : String(error || 'Unknown Supabase error')
  return new Error(`${context}: ${message}`)
}
