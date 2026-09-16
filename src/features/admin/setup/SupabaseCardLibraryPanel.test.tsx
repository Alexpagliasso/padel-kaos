// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceEntry } from '../workspace/workspaceStore'

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), archive: vi.fn(), activate: vi.fn(),
}))
vi.mock('../../../repositories/cardRepository', () => ({
  useSupabaseCardLibrary: () => ({
    definitions: [], isLoading: false, isMutating: false, error: undefined,
    cards: [{ definition: {
      id: 'card-1', name: 'Golden Point', slug: 'golden-point', description: 'Next point wins', longDescription: 'The next rally decides the game.',
      category: 'bonus', target: 'match', activationTiming: 'anytime', durationType: 'instant', durationValue: 1,
      effectType: 'golden_point', targetType: 'match', canBeStolen: false, isGlobal: true, enabled: true,
      imageUrl: 'https://example.test/card.png', archivedAt: null,
    }, activeInTournament: true }],
    createCardDefinition: mocks.create, updateCardDefinition: mocks.update,
    archiveCardDefinition: mocks.archive, setTournamentCardEnabled: mocks.activate,
  }),
}))

import { SupabaseCardLibraryPanel } from './SupabaseCardLibraryPanel'
import { validateCardDraft } from './cardDraftValidation'

afterEach(() => { cleanup(); vi.restoreAllMocks(); Object.values(mocks).forEach(mock => mock.mockReset().mockResolvedValue(undefined)) })

const entry = {
  domain: { id: 'tournament-a', name: 'Tournament A', status: 'draft', groups: [], courts: [], teams: [], matches: [], cards: [], teamCards: [], diceRules: [], kaosEvents: [], matchEvents: [], globalEvents: [], standings: [] },
  config: { name: 'Tournament A', teamsCount: 8, teamsPerGroup: 4, goldQualifiedCount: 4, silverQualifiedCount: 4, courtsCount: 2, allowByes: true, theme: 'blue', customColor: '#000000', status: 'draft', started: false },
  local: false, activeCards: [], activeEvents: [],
} as WorkspaceEntry

describe('Supabase Cards Setup UI', () => {
  it('validates only the three simplified duration modes', () => {
    const base = { name: 'Carta', slug: 'carta', description: 'Breve', longDescription: 'Descrizione lunga', imageUrl: null, effectType: 'custom', targetType: 'own_team' as const, durationType: 'instant' as const, durationValue: null, canBeStolen: true, enabled: true }
    expect(validateCardDraft(base)).toBe('')
    expect(validateCardDraft({ ...base, durationType: 'timed', durationValue: 0 })).toContain('minuti')
    expect(validateCardDraft({ ...base, durationType: 'timed', durationValue: 5 })).toBe('')
    expect(validateCardDraft({ ...base, durationType: 'games', durationValue: 1.5 })).toContain('intero positivo')
    expect(validateCardDraft({ ...base, durationType: 'games', durationValue: 2 })).toBe('')
  })

  it('edits, archives, creates and changes tournament activation through the application hook', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SupabaseCardLibraryPanel entry={entry} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Attiva in questo torneo: Golden Point' }))
    await waitFor(() => expect(mocks.activate).toHaveBeenCalledWith('card-1', false))

    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Nome/ }), { target: { value: 'Golden Point Plus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva carta' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('card-1', expect.objectContaining({ name: 'Golden Point Plus', slug: 'golden-point' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Archivia' }))
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith('card-1'))

    fireEvent.click(screen.getByRole('button', { name: 'Nuova carta' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Shield Card' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Descrizione breve/ }), { target: { value: 'Blocca un effetto' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Descrizione lunga/ }), { target: { value: 'Blocca il prossimo effetto avversario.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva carta' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shield Card', slug: 'shield-card', effectType: 'custom', canBeStolen: true })))
  })
})
