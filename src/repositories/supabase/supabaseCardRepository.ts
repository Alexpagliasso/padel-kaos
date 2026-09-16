import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardDefinition } from '../../shared/types/domain'
import { requireSupabase } from '../../services/supabase/client'
import type { CardAdminRepositoryContract, CardDefinitionInput } from '../contracts'
import { cardImageObjectPath, validateCardImage } from '../../domain/cards/cardImage'

export const cardDefinitionColumns = 'id,tournament_id,name,slug,description,long_description,image_url,effect_type,target_type,duration_type,duration_value,can_be_stolen,enabled,archived_at,updated_at'

export type SupabaseCardDefinitionAdminRow = {
  id: string
  tournament_id: string | null
  name: string
  slug: string
  description: string
  long_description: string | null
  image_url: string | null
  effect_type: string
  target_type: string
  duration_type: string
  duration_value: number | null
  can_be_stolen: boolean
  enabled: boolean
  archived_at: string | null
  updated_at: string | null
}

type ActivationRow = { card_definition_id: string; enabled: boolean }

export function createSupabaseCardRepository(client: SupabaseClient = requireSupabase()): CardAdminRepositoryContract {
  const listCardDefinitions = async () => {
    const { data, error } = await client.from('card_definitions').select(cardDefinitionColumns)
      .is('tournament_id', null).is('archived_at', null).order('name', { ascending: true })
    if (error) throw cardError('Impossibile caricare le definizioni delle carte', error)
    return ((data ?? []) as unknown as SupabaseCardDefinitionAdminRow[]).map(mapCardDefinitionRow)
  }

  return {
    listCardDefinitions,
    createCardDefinition: async input => {
      const { data, error } = await client.from('card_definitions').insert(toCardRow(input)).select(cardDefinitionColumns).single()
      if (error) throw cardError('Impossibile creare la carta', error)
      return mapCardDefinitionRow(data as unknown as SupabaseCardDefinitionAdminRow)
    },
    updateCardDefinition: async (cardId, input) => {
      requireCardId(cardId)
      const { data, error } = await client.from('card_definitions').update({ ...toCardRow(input), updated_at: new Date().toISOString() })
        .eq('id', cardId).is('tournament_id', null).is('archived_at', null).select(cardDefinitionColumns).single()
      if (error) throw cardError('Impossibile aggiornare la carta', error)
      return mapCardDefinitionRow(data as unknown as SupabaseCardDefinitionAdminRow)
    },
    archiveCardDefinition: async cardId => {
      requireCardId(cardId)
      const { data, error } = await client.rpc('archive_card_definition', { p_card_definition_id: cardId })
      if (error) throw cardError('Impossibile archiviare la carta', error)
      return mapCardDefinitionRow(data as unknown as SupabaseCardDefinitionAdminRow)
    },
    listTournamentCards: async tournamentId => {
      requireTournamentId(tournamentId)
      const [definitions, activationResult] = await Promise.all([
        listCardDefinitions(),
        client.from('tournament_card_activation').select('card_definition_id,enabled').eq('tournament_id', tournamentId),
      ])
      if (activationResult.error) throw cardError('Impossibile caricare le attivazioni delle carte del torneo', activationResult.error)
      const activation = new Map(((activationResult.data ?? []) as ActivationRow[]).map(row => [row.card_definition_id, row.enabled]))
      return definitions.map(definition => ({
        definition,
        activeInTournament: activation.get(definition.id) ?? definition.enabled,
      }))
    },
    setTournamentCardEnabled: async (tournamentId, cardId, enabled) => {
      requireTournamentId(tournamentId)
      requireCardId(cardId)
      const { error } = await client.rpc('set_tournament_card_enabled', {
        p_tournament_id: tournamentId,
        p_card_definition_id: cardId,
        p_enabled: enabled,
      })
      if (error) throw cardError('Impossibile modificare l’attivazione della carta', error)
    },
    uploadCardImage: async (cardId, file) => {
      requireCardId(cardId)
      const validation = validateCardImage(file)
      if (validation) throw new Error(validation)
      const path = cardImageObjectPath(cardId, crypto.randomUUID(), file.type)
      const bucket = client.storage.from('card-images')
      const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw cardError("Impossibile caricare l'immagine", error)
      return bucket.getPublicUrl(path).data.publicUrl
    },
    removeCardImage: async (cardId, imageUrl) => {
      requireCardId(cardId)
      const path = storagePathForCard(cardId, imageUrl)
      if (!path) return
      const { error } = await client.storage.from('card-images').remove([path])
      if (error) throw cardError("Impossibile rimuovere l'immagine", error)
    },
  }
}

export function storagePathForCard(cardId: string, imageUrl: string) {
  try {
    const marker = '/storage/v1/object/public/card-images/'
    const url = new URL(imageUrl)
    const index = url.pathname.indexOf(marker)
    if (index < 0) return null
    const path = decodeURIComponent(url.pathname.slice(index + marker.length))
    return path.startsWith(`cards/${cardId}/`) && path.split('/').length === 3 ? path : null
  } catch { return null }
}

function toCardRow(input: CardDefinitionInput) {
  return {
    tournament_id: null,
    name: input.name.trim(),
    slug: input.slug.trim(),
    description: input.description.trim(),
    long_description: input.longDescription.trim(),
    image_url: input.imageUrl?.trim() || null,
    effect_type: input.effectType.trim(),
    target_type: input.targetType,
    duration_type: input.durationType,
    duration_value: input.durationValue,
    can_be_stolen: input.canBeStolen,
    enabled: input.enabled,
  }
}

export function mapCardDefinitionRow(row: SupabaseCardDefinitionAdminRow): CardDefinition {
  const targetType = mapTargetType(row.target_type)
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    longDescription: row.long_description ?? row.description,
    imageUrl: row.image_url,
    category: targetType === 'global' || targetType === 'round' ? 'kaos' : 'bonus',
    target: targetType === 'round' || targetType === 'global' ? 'global' : targetType === 'active_card' ? 'opponent' : targetType,
    activationTiming: 'anytime',
    durationType: row.duration_type === 'timed' || row.duration_type === 'games' || row.duration_type === 'until_condition' ? row.duration_type : 'instant',
    durationValue: row.duration_value ?? 1,
    effectType: row.effect_type,
    targetType,
    canBeStolen: row.can_be_stolen,
    isGlobal: row.tournament_id === null,
    enabled: row.enabled,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }
}

function mapTargetType(value: string): NonNullable<CardDefinition['targetType']> {
  if (value === 'opponent' || value === 'match' || value === 'round' || value === 'global' || value === 'active_card') return value
  return 'own_team'
}

function requireCardId(cardId: string) {
  if (!cardId.trim()) throw new Error('ID della carta obbligatorio')
}

function requireTournamentId(tournamentId: string) {
  if (!tournamentId.trim()) throw new Error('È necessario selezionare un torneo')
}

function cardError(context: string, error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : String(error || 'Unknown Supabase error')
  return new Error(`${context}: ${message}`)
}
