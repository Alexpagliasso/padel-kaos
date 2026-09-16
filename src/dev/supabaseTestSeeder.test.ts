import { describe, expect, it, vi } from 'vitest'
import { generateTestTeams } from './tournamentSeeder'
import { DEV_TEST_TEAM_PASSWORD, seedSupabaseTestData, testCredentialsCsv, type SeedResult } from './supabaseTestSeeder'

describe('explicit Supabase development seeding', () => {
  it('does not recreate a team when a failed request may have committed remotely', async () => {
    const rows: SeedResult[] = generateTestTeams({ tournamentId: 'uncertain', count: 1, mode: 'deterministic' }).map(template => ({ template, username: '', status: 'pending' }))
    const createTeam = vi.fn().mockRejectedValue(new Error('Connection lost'))
    const services = { list: vi.fn().mockResolvedValue([]), provision: vi.fn() }
    const failed = await seedSupabaseTestData('uncertain', rows, { createTeam }, vi.fn(), services)
    const retried = await seedSupabaseTestData('uncertain', failed, { createTeam }, vi.fn(), services)
    expect(createTeam).toHaveBeenCalledTimes(1)
    expect(services.provision).not.toHaveBeenCalled()
    expect(retried[0].error).toContain('Verify it manually')
  })
  it('uses the normal roster flow, scoped provisioning and collision-safe usernames', async () => {
    const rows: SeedResult[] = generateTestTeams({ tournamentId: 'a', count: 2, mode: 'deterministic' }).map(template => ({ template, username: '', status: 'pending' }))
    const createTeam = vi.fn().mockResolvedValueOnce('uuid-a').mockResolvedValueOnce('uuid-b')
    const provision = vi.fn().mockImplementation(async input => ({ ...input, temporaryPassword: DEV_TEST_TEAM_PASSWORD }))
    const base = rows[0].template.name.toLowerCase().replaceAll(' ', '_')
    const list = vi.fn().mockResolvedValue([{ username: base }])
    const result = await seedSupabaseTestData('a', rows, { createTeam }, vi.fn(), { list, provision })
    expect(createTeam).toHaveBeenCalledTimes(2)
    expect(createTeam.mock.calls[0][0]).toMatchObject({ tournamentId: 'a', players: expect.arrayContaining([expect.objectContaining({ gender: expect.stringMatching(/male|female/) })]) })
    expect(createTeam.mock.calls[0][0].players[0].id).toBeUndefined()
    expect(provision.mock.calls[0][0]).toMatchObject({ tournamentId: 'a', role: 'team', teamId: 'uuid-a', username: `${base}_2`, password: DEV_TEST_TEAM_PASSWORD })
    expect(result.every(row => row.status === 'active')).toBe(true)
    expect(testCredentialsCsv(result).split('\r\n')).toHaveLength(3)
  })
  it('retries failed accounts without recreating teams or claiming unknown passwords', async () => {
    const rows: SeedResult[] = generateTestTeams({ tournamentId: 'retry', count: 1, mode: 'deterministic' }).map(template => ({ template, username: '', status: 'pending' }))
    const createTeam = vi.fn().mockResolvedValue('uuid')
    const provision = vi.fn().mockRejectedValueOnce(new Error('Function unavailable')).mockResolvedValue({ username: 'working' })
    const list = vi.fn().mockResolvedValue([])
    const failed = await seedSupabaseTestData('retry', rows, { createTeam }, vi.fn(), { list, provision })
    expect(failed[0]).toMatchObject({ teamId: 'uuid', status: 'error' })
    expect(testCredentialsCsv(failed)).not.toContain(DEV_TEST_TEAM_PASSWORD)
    const success = await seedSupabaseTestData('retry', failed, { createTeam }, vi.fn(), { list, provision })
    expect(success[0].status).toBe('active'); expect(createTeam).toHaveBeenCalledTimes(1)
    await seedSupabaseTestData('retry', success, { createTeam }, vi.fn(), { list, provision })
    expect(provision).toHaveBeenCalledTimes(2)
    list.mockResolvedValue([{ teamId: 'uuid', username: 'unknown-password' }])
    const unknown = await seedSupabaseTestData('retry', failed, { createTeam }, vi.fn(), { list, provision })
    expect(unknown[0].error).toContain('password is unknown')
    expect(testCredentialsCsv(unknown)).not.toContain(DEV_TEST_TEAM_PASSWORD)
  })
})
