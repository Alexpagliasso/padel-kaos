import { describe, expect, it, vi } from 'vitest'
import { provisionTournamentOperationalAccounts, STANDARD_TEST_PASSWORD } from './provisioning'
import type { Team } from '../../shared/types/domain'

const team = (id: string, name: string) => ({ id, name, shortName: name.slice(0, 3) }) as Team
const courts = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `court-${i + 1}`, name: `Campo ${i + 1}` }))

describe('one-click operational provisioning', () => {
  it.each([2, 6])('creates missing teams and %i referees with the standard password', async count => {
    const provision = vi.fn(async input => ({ ...input, temporaryPassword: input.password }))
    const result = await provisionTournamentOperationalAccounts({ tournamentId: 't-1', teams: [team('a', 'Red Team')], courts: courts(count), accounts: [], provision })
    expect(result.teams.created.map(item => item.username)).toEqual(['red_team'])
    expect(result.referees.created.map(item => item.username)).toEqual(Array.from({ length: count }, (_, i) => `arbitro${i + 1}`))
    expect(provision.mock.calls.every(([input]) => input.tournamentId === 't-1' && input.password === STANDARD_TEST_PASSWORD)).toBe(true)
    expect(provision.mock.calls[0][0]).toMatchObject({ role: 'team', teamId: 'a' })
    expect(provision.mock.calls[1][0]).toMatchObject({ role: 'referee', courtId: 'court-1' })
  })

  it('skips existing access and keeps successful credentials after a failure', async () => {
    const provision = vi.fn(async input => {
      if (input.username === 'arbitro2') throw new Error('backend unavailable')
      return { ...input, temporaryPassword: input.password }
    })
    const result = await provisionTournamentOperationalAccounts({ tournamentId: 't-1',
      teams: [team('a', 'Red'), team('b', 'Blue')], courts: courts(3),
      accounts: [
        { id: 'existing-team', role: 'team', teamId: 'a', username: 'red', displayName: 'Red' },
        { id: 'existing-referee', role: 'referee', courtId: 'court-1', courtIds: ['court-1'], username: 'arbitro1', displayName: 'Arbitro 1' },
      ], provision })
    expect(result.teams).toMatchObject({ existing: 1, failed: [] })
    expect(result.teams.created.map(item => item.username)).toEqual(['blue'])
    expect(result.referees.existing).toBe(1)
    expect(result.referees.failed).toHaveLength(1)
    expect(result.referees.created.map(item => item.username)).toEqual(['arbitro3'])
  })
})
