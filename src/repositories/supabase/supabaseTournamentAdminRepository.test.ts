import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseTournamentAdminRepository } from './supabaseTournamentAdminRepository'
import type { Tournament } from '../../shared/types/domain'

const row = (id: string, name = id) => ({
  id, name, phase: 'GROUP_STAGE', status: 'draft', teams_count: null,
  teams_per_group: null, gold_qualified_count: null, silver_qualified_count: null,
  courts_count: null, allow_byes: true, theme_preset: 'blue', theme_color: null,
  created_at: '2026-09-12T10:00:00Z', updated_at: '2026-09-12T10:00:00Z',
})
const domain = (id: string): Tournament => ({ id, name: id, groups: [], courts: [], teams: [], matches: [], cards: [], teamCards: [], diceRules: [], kaosEvents: [], matchEvents: [], globalEvents: [], standings: [] })

function setup(options: { list?: unknown[]; rpcData?: unknown } = {}) {
  const order = vi.fn().mockResolvedValue({ data: options.list ?? [], error: null })
  const select = vi.fn().mockReturnValue({ order })
  const from = vi.fn().mockReturnValue({ select })
  const rpc = vi.fn().mockResolvedValue({ data: options.rpcData ?? null, error: null })
  const loadById = vi.fn(async (id: string) => domain(id))
  const repository = createSupabaseTournamentAdminRepository({ client: { from, rpc } as unknown as SupabaseClient, loadById })
  return { repository, from, select, order, rpc, loadById }
}

describe('Supabase multi-tournament repository', () => {
  it('lists every RLS-accessible tournament without selecting the first', async () => {
    const { repository } = setup({ list: [row('a', 'Alpha'), row('b', 'Beta')] })
    const result = await repository.listTournaments()
    expect(result.map(item => item.id)).toEqual(['a', 'b'])
    expect(result[0]).toMatchObject({ name: 'Alpha', teamsCount: null, teamsPerGroup: null })
  })
  it('gets the explicitly requested tournament', async () => {
    const { repository, loadById } = setup()
    await expect(repository.getTournament('b')).resolves.toMatchObject({ id: 'b' })
    expect(loadById).toHaveBeenCalledWith('b')
  })
  it.each([{ returned: 'created-id' }, { returned: { id: 'created-id' } }, { returned: [{ id: 'created-id' }] }])('creates through the exact RPC argument and reloads its result', async ({ returned }) => {
    const { repository, rpc, loadById } = setup({ rpcData: returned })
    await repository.createTournament('  Autumn Open  ')
    expect(rpc).toHaveBeenCalledWith('create_tournament_for_admin', { p_name: 'Autumn Open' })
    expect(loadById).toHaveBeenCalledWith('created-id')
  })
  it('updates configuration and persisted courts atomically before reloading', async () => {
    const { repository, rpc, loadById } = setup()
    await repository.updateTournamentConfiguration('a', { name: 'A', teamsCount: 30, teamsPerGroup: 5, goldQualifiedCount: 12, silverQualifiedCount: 12, courtsCount: 6, allowByes: true, themePreset: 'custom', themeColor: '#123ABC' })
    expect(rpc).toHaveBeenCalledWith('update_tournament_configuration_with_courts', { p_tournament_id: 'a', p_name: 'A', p_teams_count: 30, p_teams_per_group: 5, p_gold_qualified_count: 12, p_silver_qualified_count: 12, p_courts_count: 6, p_allow_byes: true, p_theme_preset: 'custom', p_theme_color: '#123ABC' })
    expect(loadById).toHaveBeenCalledWith('a')
  })
  it('surfaces court synchronization errors in Italian and does not reload stale data', async () => {
    const { repository, rpc, loadById } = setup()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'campo assegnato' } })
    await expect(repository.updateTournamentConfiguration('a', { name: 'A', teamsCount: 10, teamsPerGroup: 5, goldQualifiedCount: 4, silverQualifiedCount: 4, courtsCount: 2, allowByes: true, themePreset: 'blue', themeColor: null })).rejects.toThrow('Impossibile aggiornare la configurazione e i campi del torneo: campo assegnato')
    expect(loadById).not.toHaveBeenCalled()
  })
  it('uses only the safe-delete RPC and preserves its backend reason', async () => {
    const { repository, rpc, from } = setup()
    await repository.deleteTournamentIfSafe('a')
    expect(rpc).toHaveBeenCalledWith('delete_tournament_if_safe', { p_tournament_id: 'a' })
    expect(from).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'cannot hard delete tournament while auth profiles still exist' } })
    await expect(repository.deleteTournamentIfSafe('a')).rejects.toThrow('auth profiles still exist')
  })
})
