// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tournament } from '../shared/types/domain'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), update: vi.fn(), selectedLoads: [] as Array<string | null>,
}))
vi.mock('.', () => ({ dataProvider: 'supabase' }))
vi.mock('./supabase/supabaseTournamentAdminRepository', () => ({
  createSupabaseTournamentAdminRepository: () => ({
    listTournaments: mocks.list,
    createTournament: mocks.create,
    updateTournamentConfiguration: mocks.update,
  }),
}))
vi.mock('./supabase/supabaseRepositories', async importOriginal => ({
  ...await importOriginal<object>(),
  useSupabaseTournamentRepository: (id: string | null) => {
    mocks.selectedLoads.push(id)
    return { data: tournament(id ?? 'empty'), isLoading: false }
  },
}))

import { useTournamentRepository } from './tournamentRepository'
import { useSelectedTournamentStore } from '../features/tournament/selectedTournamentStore'

afterEach(cleanup)

function tournament(id: string): Tournament {
  return { id, name: id, groups: [], courts: [], teams: [], matches: [], cards: [], teamCards: [], diceRules: [], kaosEvents: [], matchEvents: [], globalEvents: [], standings: [] }
}
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  localStorage.clear()
  useSelectedTournamentStore.setState({ selectedTournamentId: null })
  mocks.selectedLoads.length = 0
  mocks.list.mockReset().mockResolvedValue([tournament('a'), tournament('b')])
  mocks.create.mockReset().mockImplementation(async (name: string) => {
    const created = tournament(name === 'Third' ? 'c' : name)
    mocks.list.mockResolvedValue([tournament('a'), tournament('b'), created])
    return created
  })
  mocks.update.mockReset().mockImplementation(async (id: string) => tournament(id))
})

describe('Supabase tournament application selection', () => {
  it('restores a valid preference and switches explicit detail IDs', async () => {
    useSelectedTournamentStore.getState().selectTournament('b')
    const { result } = renderHook(useTournamentRepository, { wrapper: wrapper() })
    await waitFor(() => expect(result.current.selectedTournamentId).toBe('b'))
    expect(result.current.data.id).toBe('b')
    act(() => result.current.selectTournament?.('a'))
    await waitFor(() => expect(result.current.data.id).toBe('a'))
    expect(mocks.selectedLoads).toContain('b')
    expect(mocks.selectedLoads).toContain('a')
  })
  it('falls back from an inaccessible preference and clears when no tournaments exist', async () => {
    useSelectedTournamentStore.getState().selectTournament('removed')
    const first = renderHook(useTournamentRepository, { wrapper: wrapper() })
    await waitFor(() => expect(first.result.current.selectedTournamentId).toBe('a'))
    first.unmount()
    mocks.list.mockResolvedValue([])
    const empty = renderHook(useTournamentRepository, { wrapper: wrapper() })
    await waitFor(() => expect(empty.result.current.selectedTournamentId).toBeNull())
  })
  it('selects a newly persisted tournament immediately', async () => {
    const { result } = renderHook(useTournamentRepository, { wrapper: wrapper() })
    await waitFor(() => expect(result.current.tournaments).toHaveLength(2))
    await act(() => result.current.createTournament?.('Third'))
    await waitFor(() => expect(result.current.selectedTournamentId).toBe('c'))
    expect(result.current.data.id).toBe('c')
    expect(result.current.tournaments?.map(item => item.id)).toContain('c')
  })
})
