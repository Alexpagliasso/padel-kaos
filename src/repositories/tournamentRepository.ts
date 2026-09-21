import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataProvider } from '.'
import type { TournamentConfigurationInput } from './contracts'
import { useDemoTournamentRepository } from './demo/demoRepositories'
import { useSupabaseTournamentRepository } from './supabase/supabaseRepositories'
import { createSupabaseTournamentAdminRepository } from './supabase/supabaseTournamentAdminRepository'
import { supabaseTournamentKeys } from './supabase/queryKeys'
import { resolveSelectedTournamentId, useSelectedTournamentStore } from '../features/tournament/selectedTournamentStore'
import { cleanupTournamentAuthUsers } from '../services/supabase/provisioning'

export function useTournamentRepository() {
  const supabaseEnabled = dataProvider === 'supabase'
  const selectedTournamentId = useSelectedTournamentStore(state => state.selectedTournamentId)
  const selectTournament = useSelectedTournamentStore(state => state.selectTournament)
  const createdSelectionRef = useRef<string | null>(null)
  const queryClient = useQueryClient()
  const demoRepository = useDemoTournamentRepository()
  const listQuery = useQuery({
    queryKey: supabaseTournamentKeys.list(),
    enabled: supabaseEnabled,
    queryFn: () => createSupabaseTournamentAdminRepository().listTournaments(),
  })
  const createMutation = useMutation({
    mutationFn: (name: string) => createSupabaseTournamentAdminRepository().createTournament(name),
    onSuccess: tournament => {
      createdSelectionRef.current = tournament.id
      queryClient.setQueryData(supabaseTournamentKeys.detail(tournament.id), tournament)
      queryClient.setQueryData<typeof listQuery.data>(supabaseTournamentKeys.list(), current => [
        ...(current ?? []).filter(item => item.id !== tournament.id),
        tournament,
      ])
      selectTournament(tournament.id)
      void queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.list() })
    },
  })
  const createdTournament = createMutation.data
  const tournaments = useMemo(() => createdTournament && !(listQuery.data ?? []).some(tournament => tournament.id === createdTournament.id)
    ? [...(listQuery.data ?? []), createdTournament]
    : (listQuery.data ?? []), [createdTournament, listQuery.data])
  const accessibleIds = useMemo(() => tournaments.map(tournament => tournament.id), [tournaments])
  const resolvedTournamentId = resolveSelectedTournamentId(selectedTournamentId, accessibleIds)
  const supabaseRepository = useSupabaseTournamentRepository(resolvedTournamentId, supabaseEnabled && !listQuery.isLoading)

  useEffect(() => {
    if (createdSelectionRef.current) {
      const currentSelection = useSelectedTournamentStore.getState().selectedTournamentId
      if (accessibleIds.includes(createdSelectionRef.current) && currentSelection === createdSelectionRef.current) {
        createdSelectionRef.current = null
      } else {
        return
      }
    }
    if (!supabaseEnabled || listQuery.isLoading || resolvedTournamentId === selectedTournamentId) return
    // Ignore an effect rendered for an older preference (for example while a
    // just-created tournament is being selected).
    if (useSelectedTournamentStore.getState().selectedTournamentId !== selectedTournamentId) return
    selectTournament(resolvedTournamentId)
  }, [accessibleIds, listQuery.isLoading, resolvedTournamentId, selectTournament, selectedTournamentId, supabaseEnabled])

  const updateMutation = useMutation({
    mutationFn: ({ tournamentId, input }: { tournamentId: string; input: TournamentConfigurationInput }) =>
      createSupabaseTournamentAdminRepository().updateTournamentConfiguration(tournamentId, input),
    onSuccess: async tournament => {
      queryClient.setQueryData(supabaseTournamentKeys.detail(tournament.id), tournament)
      queryClient.setQueryData<typeof listQuery.data>(supabaseTournamentKeys.list(), current =>
        current?.map(item => item.id === tournament.id ? tournament : item),
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournament.id) }),
        queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.list() }),
      ])
    },
  })
  const deleteMutation = useMutation({
    mutationFn: async (tournamentId: string) => {
      await cleanupTournamentAuthUsers(tournamentId)
      await createSupabaseTournamentAdminRepository().deleteTournamentIfSafe(tournamentId)
    },
    onSuccess: async (_, tournamentId) => {
      queryClient.removeQueries({ queryKey: supabaseTournamentKeys.detail(tournamentId) })
      queryClient.setQueryData<typeof listQuery.data>(supabaseTournamentKeys.list(), current =>
        current?.filter(item => item.id !== tournamentId))
      if (useSelectedTournamentStore.getState().selectedTournamentId === tournamentId) selectTournament(null)
      await queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.list() })
    },
  })

  const createTournament = async (name: string) => {
    const tournament = await createMutation.mutateAsync(name)
    // mutateAsync resolves after mutation callbacks. Reassert the user's new
    // selection after any list-cache notification produced by those callbacks.
    selectTournament(tournament.id)
    return tournament
  }

  if (!supabaseEnabled) return demoRepository
  return {
    ...supabaseRepository,
    tournaments,
    selectedTournamentId: resolvedTournamentId,
    selectTournament,
    createTournament,
    updateTournamentConfiguration: (tournamentId: string, input: TournamentConfigurationInput) => updateMutation.mutateAsync({ tournamentId, input }),
    deleteTournamentIfSafe: (tournamentId: string) => deleteMutation.mutateAsync(tournamentId),
    isLoading: listQuery.isLoading || (Boolean(resolvedTournamentId) && supabaseRepository.isLoading),
    isCreating: createMutation.isPending,
    isSaving: updateMutation.isPending,
    error: listQuery.error instanceof Error
      ? listQuery.error.message
      : createMutation.error instanceof Error
        ? createMutation.error.message
        : updateMutation.error instanceof Error
          ? updateMutation.error.message
        : deleteMutation.error instanceof Error
          ? deleteMutation.error.message
          : supabaseRepository.error,
  }
}
