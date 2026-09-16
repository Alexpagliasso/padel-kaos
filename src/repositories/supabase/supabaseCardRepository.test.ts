import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardDefinitionInput } from '../contracts'
import { createSupabaseCardRepository, storagePathForCard } from './supabaseCardRepository'

const input: CardDefinitionInput = {
  name: 'Golden Point', slug: 'golden-point', description: 'Next point wins', longDescription: 'The next rally decides the game.', imageUrl: 'https://example.test/card.png',
  effectType: 'golden_point', targetType: 'match', durationType: 'instant', durationValue: null,
  canBeStolen: false, enabled: true,
}
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1', tournament_id: null, name: 'Golden Point', slug: 'golden-point', description: 'Next point wins', long_description: 'The next rally decides the game.',
  image_url: 'https://example.test/card.png', effect_type: 'golden_point', target_type: 'match',
  duration_type: 'instant', duration_value: null, can_be_stolen: false, enabled: true,
  archived_at: null, updated_at: '2026-09-12T10:00:00Z', ...overrides,
})

function setup(activations: Record<string, Array<{ card_definition_id: string; enabled: boolean }>> = {}) {
  const insert = vi.fn()
  const update = vi.fn()
  const definitionBuilder: Record<string, ReturnType<typeof vi.fn>> = {}
  definitionBuilder.select = vi.fn(() => definitionBuilder)
  definitionBuilder.is = vi.fn(() => definitionBuilder)
  definitionBuilder.order = vi.fn().mockResolvedValue({ data: [row()], error: null })
  definitionBuilder.insert = insert.mockImplementation(() => definitionBuilder)
  definitionBuilder.update = update.mockImplementation(() => definitionBuilder)
  definitionBuilder.eq = vi.fn(() => definitionBuilder)
  definitionBuilder.single = vi.fn().mockResolvedValue({ data: row(), error: null })
  const activationBuilder = {
    select: vi.fn(),
    eq: vi.fn((_: string, tournamentId: string) => Promise.resolve({ data: activations[tournamentId] ?? [], error: null })),
  }
  activationBuilder.select.mockReturnValue(activationBuilder)
  const from = vi.fn((table: string) => table === 'tournament_card_activation' ? activationBuilder : definitionBuilder)
  const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: { message: string } | null }> => ({ data: name === 'archive_card_definition' ? row({ archived_at: '2026-09-14T10:00:00Z', enabled: false }) : null, error: null }))
  const upload = vi.fn(async () => ({ data: {}, error: null }))
  const remove = vi.fn(async () => ({ data: {}, error: null }))
  const bucket = { upload, remove, getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/card-images/${path}` } })) }
  const storage = { from: vi.fn(() => bucket) }
  const repository = createSupabaseCardRepository({ from, rpc, storage } as unknown as SupabaseClient)
  return { repository, from, insert, update, rpc, definitionBuilder, activationBuilder, upload, remove, storage }
}

describe('Supabase card repository', () => {
  it('creates a global definition with every persisted gameplay field', async () => {
    const { repository, insert } = setup()
    await repository.createCardDefinition(input)
    expect(insert).toHaveBeenCalledWith({
      tournament_id: null, name: 'Golden Point', slug: 'golden-point', description: 'Next point wins', long_description: 'The next rally decides the game.',
      image_url: 'https://example.test/card.png', effect_type: 'golden_point', target_type: 'match',
      duration_type: 'instant', duration_value: null, can_be_stolen: false, enabled: true,
    })
  })

  it('maps short and long descriptions independently with a legacy fallback', async () => {
    const current = setup()
    await expect(current.repository.listCardDefinitions()).resolves.toMatchObject([{ description: 'Next point wins', longDescription: 'The next rally decides the game.' }])
    current.definitionBuilder.order.mockResolvedValueOnce({ data: [row({ long_description: null })], error: null })
    await expect(current.repository.listCardDefinitions()).resolves.toMatchObject([{ description: 'Next point wins', longDescription: 'Next point wins' }])
  })

  it('keeps a card without an image valid', async () => {
    const current = setup()
    current.definitionBuilder.order.mockResolvedValueOnce({ data: [row({ image_url: null })], error: null })
    await expect(current.repository.listCardDefinitions()).resolves.toMatchObject([{ imageUrl: null }])
  })

  it('updates only a non-archived global definition', async () => {
    const { repository, update, definitionBuilder } = setup()
    await repository.updateCardDefinition('card-1', { ...input, name: 'Edited' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Edited', updated_at: expect.any(String) }))
    expect(definitionBuilder.eq).toHaveBeenCalledWith('id', 'card-1')
    expect(definitionBuilder.is).toHaveBeenCalledWith('archived_at', null)
  })

  it('archives through the verified RPC parameter', async () => {
    const { repository, rpc } = setup()
    await expect(repository.archiveCardDefinition('card-1')).resolves.toMatchObject({ archivedAt: expect.any(String), enabled: false })
    expect(rpc).toHaveBeenCalledWith('archive_card_definition', { p_card_definition_id: 'card-1' })
  })

  it('uses the verified activation RPC parameters', async () => {
    const { repository, rpc } = setup()
    await repository.setTournamentCardEnabled('tournament-a', 'card-1', false)
    expect(rpc).toHaveBeenCalledWith('set_tournament_card_enabled', {
      p_tournament_id: 'tournament-a', p_card_definition_id: 'card-1', p_enabled: false,
    })
  })

  it('surfaces the backend archived-card activation rejection', async () => {
    const { repository, rpc } = setup()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'archived card cannot be enabled' } })
    await expect(repository.setTournamentCardEnabled('tournament-a', 'card-1', true)).rejects.toThrow('archived card cannot be enabled')
  })

  it('keeps Tournament A/B activation separate and falls back to definition.enabled', async () => {
    const { repository } = setup({
      'tournament-a': [{ card_definition_id: 'card-1', enabled: true }],
      'tournament-b': [{ card_definition_id: 'card-1', enabled: false }],
    })
    await expect(repository.listTournamentCards('tournament-a')).resolves.toMatchObject([{ activeInTournament: true }])
    await expect(repository.listTournamentCards('tournament-b')).resolves.toMatchObject([{ activeInTournament: false }])
    await expect(repository.listTournamentCards('tournament-c')).resolves.toMatchObject([{ activeInTournament: true }])
  })

  it('uploads to a card-isolated path and removes only that card path', async () => {
    const { repository, upload, remove } = setup()
    const file = new File(['image'], 'untrusted name.png', { type: 'image/png' })
    const url = await repository.uploadCardImage('card-1', file)
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^cards\/card-1\/[0-9a-f-]+\.png$/), file, { contentType: 'image/png', upsert: false })
    await repository.removeCardImage('card-1', url)
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^cards\/card-1\/[0-9a-f-]+\.png$/)])
    await repository.removeCardImage('card-2', url)
    expect(remove).toHaveBeenCalledTimes(1)
  })
})

describe('card image storage isolation', () => {
  it('extracts only paths owned by the requested card', () => {
    const url = 'https://project.supabase.co/storage/v1/object/public/card-images/cards/card-1/file.png'
    expect(storagePathForCard('card-1', url)).toBe('cards/card-1/file.png')
    expect(storagePathForCard('card-2', url)).toBeNull()
  })
})
