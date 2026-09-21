import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./client', () => ({ requireSupabase: () => ({
  functions: { invoke },
  auth: { getSession: async () => ({ data: { session: { access_token: 'token' } }, error: null }) },
}) }))

import { cleanupTournamentAuthUsers, provisionTeamAccounts, provisionTournamentUser, STANDARD_TEST_PASSWORD } from './provisioning'

beforeEach(() => invoke.mockReset())

describe('authoritative Edge Function callers', () => {
  it('passes the exact bulk password to provisioning without changing manual input', async () => {
    invoke.mockResolvedValueOnce({ data: { credentials: [] }, error: null })
      .mockResolvedValueOnce({ data: { username: 'custom', role: 'team' }, error: null })
    await provisionTeamAccounts({ tournamentId: 'target', teams: [{ id: 'team-1', name: 'Red', shortName: 'RED' }] })
    await provisionTournamentUser({ tournamentId: 'target', role: 'team', teamId: 'team-2', username: 'custom', password: 'MyCustom123!' })
    expect(invoke).toHaveBeenNthCalledWith(1, 'provision-tournament-user', expect.objectContaining({
      body: expect.objectContaining({ action: 'provision', password: STANDARD_TEST_PASSWORD }),
    }))
    expect(invoke).toHaveBeenNthCalledWith(2, 'provision-tournament-user', expect.objectContaining({
      body: expect.objectContaining({ action: 'provision', password: 'MyCustom123!' }),
    }))
  })

  it('calls cleanup on the same endpoint and blocks tournament deletion on partial failure', async () => {
    invoke.mockResolvedValueOnce({ data: { deleted: 2, alreadyMissing: 1, failed: 0 }, error: null })
      .mockResolvedValueOnce({ data: { deleted: 1, alreadyMissing: 0, failed: 1 }, error: null })
    await expect(cleanupTournamentAuthUsers('target')).resolves.toEqual({ deleted: 2, alreadyMissing: 1, failed: 0 })
    await expect(cleanupTournamentAuthUsers('target')).rejects.toThrow('Pulizia account incompleta')
    expect(invoke).toHaveBeenCalledWith('provision-tournament-user', {
      body: { action: 'cleanup_tournament_auth', tournamentId: 'target' },
    })
  })
})
