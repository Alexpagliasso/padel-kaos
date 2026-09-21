import { describe, expect, it, vi } from 'vitest'
import { cleanupTournamentAuth, type CleanupDependencies, type CleanupProfile } from './cleanup'

function setup(status: string, profiles: CleanupProfile[] = [{ id: 'team-1', role: 'team' }]) {
  const dependencies: CleanupDependencies = {
    getTournamentStatus: vi.fn(async () => status),
    listProfiles: vi.fn(async () => profiles),
    deleteAuthUser: vi.fn(async () => ({ error: null })),
    deleteProfile: vi.fn(async () => {}),
  }
  return dependencies
}

describe('authoritative Edge cleanup operation', () => {
  it.each(['draft', 'configured'])('cleans operational users in %s', async status => {
    const dependencies = setup(status, [
      { id: 'team-1', role: 'team' }, { id: 'ref-1', role: 'referee' },
      { id: 'display-1', role: 'court_display' }, { id: 'main-1', role: 'main_display' },
    ])
    await expect(cleanupTournamentAuth('target', 'admin-1', dependencies)).resolves.toEqual({ deleted: 4, alreadyMissing: 0, failed: 0 })
    expect(dependencies.getTournamentStatus).toHaveBeenCalledWith('target')
    expect(dependencies.deleteProfile).toHaveBeenCalledWith('team-1', 'target')
  })

  it.each(['live', 'completed', 'archived'])('rejects %s before reading profiles or Auth', async status => {
    const dependencies = setup(status)
    await expect(cleanupTournamentAuth('target', 'admin-1', dependencies)).rejects.toThrow('locked after start')
    expect(dependencies.listProfiles).not.toHaveBeenCalled()
    expect(dependencies.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('never deletes Admin users even if returned by a malformed profile query', async () => {
    const dependencies = setup('draft', [
      { id: 'admin-1', role: 'admin' }, { id: 'admin-2', role: 'admin' }, { id: 'team-1', role: 'team' },
    ])
    await cleanupTournamentAuth('target', 'admin-1', dependencies)
    expect(dependencies.deleteAuthUser).toHaveBeenCalledTimes(1)
    expect(dependencies.deleteAuthUser).toHaveBeenCalledWith('team-1')
  })

  it('tolerates missing Auth users and reports a partial failure without losing progress', async () => {
    const dependencies = setup('draft', [
      { id: 'missing', role: 'team' }, { id: 'failed', role: 'referee' }, { id: 'deleted', role: 'team' },
    ])
    vi.mocked(dependencies.deleteAuthUser).mockImplementation(async id => ({
      error: id === 'missing' ? { status: 404, message: 'User not found' }
        : id === 'failed' ? { status: 500, message: 'Unavailable' } : null,
    }))
    await expect(cleanupTournamentAuth('target', 'admin', dependencies)).resolves.toEqual({ deleted: 1, alreadyMissing: 1, failed: 1 })
    expect(dependencies.deleteProfile).toHaveBeenCalledWith('missing', 'target')
    expect(dependencies.deleteProfile).not.toHaveBeenCalledWith('failed', 'target')
    expect(dependencies.deleteProfile).toHaveBeenCalledWith('deleted', 'target')
  })
})
