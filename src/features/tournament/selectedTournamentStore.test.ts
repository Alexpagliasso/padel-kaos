// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveSelectedTournamentId, selectedTournamentStorageKey, useSelectedTournamentStore } from './selectedTournamentStore'
import { supabaseTournamentKeys } from '../../repositories/supabase/queryKeys'

beforeEach(() => {
  localStorage.clear()
  useSelectedTournamentStore.setState({ selectedTournamentId: null })
})

describe('explicit selected tournament preference', () => {
  it('keeps an accessible persisted selection and falls back explicitly', () => {
    expect(resolveSelectedTournamentId('b', ['a', 'b'])).toBe('b')
    expect(resolveSelectedTournamentId('removed', ['a', 'b'])).toBe('a')
    expect(resolveSelectedTournamentId('removed', [])).toBeNull()
  })
  it('persists only the selected ID', async () => {
    useSelectedTournamentStore.getState().selectTournament('b')
    const serialized = JSON.parse(localStorage.getItem(selectedTournamentStorageKey)!)
    expect(serialized.state).toEqual({ selectedTournamentId: 'b' })
    expect(serialized.state).not.toHaveProperty('tournament')
    const persisted = localStorage.getItem(selectedTournamentStorageKey)!
    useSelectedTournamentStore.setState({ selectedTournamentId: null })
    localStorage.setItem(selectedTournamentStorageKey, persisted)
    await useSelectedTournamentStore.persist.rehydrate()
    expect(useSelectedTournamentStore.getState().selectedTournamentId).toBe('b')
  })
  it('uses distinct server cache keys for each tournament', () => {
    expect(supabaseTournamentKeys.detail('a')).toEqual(['supabase', 'tournament', 'a'])
    expect(supabaseTournamentKeys.detail('b')).toEqual(['supabase', 'tournament', 'b'])
    expect(supabaseTournamentKeys.detail('a')).not.toEqual(supabaseTournamentKeys.detail('b'))
    expect(supabaseTournamentKeys.list()).toEqual(['supabase', 'tournaments', 'list'])
  })
})
