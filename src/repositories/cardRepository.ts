import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CardDefinitionInput } from './contracts'
import { createSupabaseCardRepository } from './supabase/supabaseCardRepository'
import { supabaseCardKeys } from './supabase/queryKeys'

export function useSupabaseCardLibrary(tournamentId: string | null) {
  const queryClient = useQueryClient()
  const repository = createSupabaseCardRepository()
  const definitions = useQuery({
    queryKey: supabaseCardKeys.definitions(),
    queryFn: repository.listCardDefinitions,
  })
  const tournamentCards = useQuery({
    queryKey: supabaseCardKeys.tournament(tournamentId ?? 'none'),
    queryFn: () => repository.listTournamentCards(tournamentId!),
    enabled: Boolean(tournamentId),
  })

  const invalidateDefinitionViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: supabaseCardKeys.definitions() }),
      queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === 'supabase' && query.queryKey[1] === 'tournament' && query.queryKey[3] === 'cards',
      }),
    ])
  }
  const create = useMutation({
    mutationFn: (input: CardDefinitionInput) => repository.createCardDefinition(input),
    onSuccess: invalidateDefinitionViews,
  })
  const update = useMutation({
    mutationFn: ({ cardId, input }: { cardId: string; input: CardDefinitionInput }) => repository.updateCardDefinition(cardId, input),
    onSuccess: invalidateDefinitionViews,
  })
  const archive = useMutation({
    mutationFn: repository.archiveCardDefinition,
    onSuccess: invalidateDefinitionViews,
  })
  const activation = useMutation({
    mutationFn: ({ cardId, enabled }: { cardId: string; enabled: boolean }) => {
      if (!tournamentId) throw new Error('Seleziona un torneo prima di modificare l’attivazione della carta.')
      const card = tournamentCards.data?.find(item => item.definition.id === cardId)
      if (card?.definition.archivedAt && enabled) throw new Error('Le carte archiviate non possono essere attivate.')
      return repository.setTournamentCardEnabled(tournamentId, cardId, enabled)
    },
    onSuccess: () => tournamentId && queryClient.invalidateQueries({ queryKey: supabaseCardKeys.tournament(tournamentId) }),
  })
  const uploadImage = useMutation({ mutationFn: ({ cardId, file }: { cardId: string; file: File }) => repository.uploadCardImage(cardId, file) })
  const removeImage = useMutation({ mutationFn: ({ cardId, imageUrl }: { cardId: string; imageUrl: string }) => repository.removeCardImage(cardId, imageUrl) })
  const errors = [definitions.error, tournamentCards.error, create.error, update.error, archive.error, activation.error, uploadImage.error, removeImage.error]
  const error = errors.find(value => value instanceof Error)

  return {
    definitions: definitions.data ?? [],
    cards: tournamentCards.data ?? [],
    isLoading: definitions.isLoading || (Boolean(tournamentId) && tournamentCards.isLoading),
    isMutating: create.isPending || update.isPending || archive.isPending || activation.isPending || uploadImage.isPending || removeImage.isPending,
    error: error instanceof Error ? error.message : undefined,
    createCardDefinition: create.mutateAsync,
    updateCardDefinition: (cardId: string, input: CardDefinitionInput) => update.mutateAsync({ cardId, input }),
    archiveCardDefinition: archive.mutateAsync,
    setTournamentCardEnabled: (cardId: string, enabled: boolean) => activation.mutateAsync({ cardId, enabled }),
    uploadCardImage: (cardId: string, file: File) => uploadImage.mutateAsync({ cardId, file }),
    removeCardImage: (cardId: string, imageUrl: string) => removeImage.mutateAsync({ cardId, imageUrl }),
  }
}
