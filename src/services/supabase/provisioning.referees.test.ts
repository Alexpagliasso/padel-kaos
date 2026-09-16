import { describe, expect, it, vi } from 'vitest'
import {
  getMissingRefereeCourts,
  provisionMissingRefereeAccounts,
  RefereeProvisioningError,
  type ProvisionedCredential,
} from './provisioning'
import type { ExistingProvisionedAccount } from '../../features/auth/accessManagementState'

const courts = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `court-${index + 1}`,
  name: `Campo ${index + 1}`,
}))

const referee = (courtNumber: number, displayName = `Arbitro ${courtNumber}`): ExistingProvisionedAccount => ({
  id: `referee-${courtNumber}`,
  role: 'referee',
  username: `arbitro${courtNumber}`,
  displayName,
  courtId: `court-${courtNumber}`,
})

function successfulProvisioner() {
  return vi.fn(async (input): Promise<ProvisionedCredential> => ({
    username: input.username,
    temporaryPassword: `Password-${input.username}`,
    role: input.role,
    courtId: input.courtId,
    teamName: input.teamName,
  }))
}

describe('automatic referee provisioning', () => {
  it.each([2, 6])('creates one correctly assigned referee for each of %i uncovered courts', async (count) => {
    const provision = successfulProvisioner()
    const result = await provisionMissingRefereeAccounts({ tournamentId: 'tournament-1', courts: courts(count), accounts: [], provision })

    expect(result).toHaveLength(count)
    expect(provision).toHaveBeenCalledTimes(count)
    expect(provision.mock.calls.map(([input]) => input.courtId)).toEqual(courts(count).map((court) => court.id))
    expect(result.map((credential) => credential.username)).toEqual(Array.from({ length: count }, (_, index) => `arbitro${index + 1}`))
    expect(result.every((credential) => Boolean(credential.temporaryPassword))).toBe(true)
  })

  it('creates only uncovered referees and preserves a custom existing referee', async () => {
    const existing = [referee(1, 'Mario Rossi'), referee(2), referee(3), referee(4)]
    const provision = successfulProvisioner()
    const result = await provisionMissingRefereeAccounts({ tournamentId: 'tournament-1', courts: courts(6), accounts: existing, provision })

    expect(result.map((credential) => credential.courtId)).toEqual(['court-5', 'court-6'])
    expect(existing[0].displayName).toBe('Mario Rossi')
    expect(provision).not.toHaveBeenCalledWith(expect.objectContaining({ courtId: 'court-1' }))
  })

  it('treats every court assigned to one multi-court referee as covered', async () => {
    const mario: ExistingProvisionedAccount = { ...referee(1, 'Mario Rossi'), courtIds: ['court-1', 'court-2'] }
    expect(getMissingRefereeCourts(courts(2), [mario])).toEqual([])
  })

  it('creates only the third referee when Mario covers the first two courts', async () => {
    const mario: ExistingProvisionedAccount = { ...referee(1, 'Mario Rossi'), courtIds: ['court-1', 'court-2'] }
    const provision = successfulProvisioner()
    const result = await provisionMissingRefereeAccounts({ tournamentId: 'tournament-1', courts: courts(3), accounts: [mario], provision })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ username: 'arbitro3', courtId: 'court-3', teamName: 'Arbitro 3' })
  })

  it('does nothing when all courts are covered, including after accounts are refreshed', async () => {
    const provision = successfulProvisioner()
    const first = await provisionMissingRefereeAccounts({ tournamentId: 'tournament-1', courts: courts(2), accounts: [], provision })
    const refreshed = first.map((credential, index): ExistingProvisionedAccount => ({
      id: `new-${index}`,
      role: 'referee',
      username: credential.username,
      displayName: credential.teamName ?? credential.username,
      courtId: credential.courtId,
    }))
    const second = await provisionMissingRefereeAccounts({ tournamentId: 'tournament-1', courts: courts(2), accounts: refreshed, provision })

    expect(first).toHaveLength(2)
    expect(second).toEqual([])
    expect(provision).toHaveBeenCalledTimes(2)
    expect(getMissingRefereeCourts(courts(2), refreshed)).toEqual([])
  })

  it('uses an available suffix when the preferred username already belongs to another account', async () => {
    const provision = successfulProvisioner()
    const accounts: ExistingProvisionedAccount[] = [{ id: 'team-1', role: 'team', username: 'arbitro1', displayName: 'Team', teamId: 'team-1' }]
    const result = await provisionMissingRefereeAccounts({ tournamentId: 'tournament-1', courts: courts(1), accounts, provision })

    expect(result[0].username).toBe('arbitro1-2')
    expect(provision).toHaveBeenCalledWith(expect.objectContaining({ role: 'referee', courtId: 'court-1', teamName: 'Arbitro 1' }))
  })

  it('returns credentials already created when a later provisioning call fails', async () => {
    const provision = vi.fn()
      .mockResolvedValueOnce({ username: 'arbitro1', temporaryPassword: 'Password1', role: 'referee', courtId: 'court-1', teamName: 'Arbitro 1' })
      .mockRejectedValueOnce(new Error('backend unavailable'))

    try {
      await provisionMissingRefereeAccounts({ tournamentId: 'tournament-1', courts: courts(2), accounts: [], provision })
      throw new Error('expected provisioning to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(RefereeProvisioningError)
      expect((error as RefereeProvisioningError).createdCredentials).toHaveLength(1)
      expect((error as Error).message).toContain('backend unavailable')
    }
  })
})
