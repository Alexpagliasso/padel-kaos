import { describe, expect, it } from 'vitest'
import { getRoleShellNavItems } from './roleNavigation'

describe('getRoleShellNavItems', () => {
  it('does not expose global links without an admin role, including demo', () => {
    expect(getRoleShellNavItems('demo')).toEqual([])
  })

  it.each([
    ['admin', ['/admin', '/court-display', '/main-display']],
    ['team', []],
    ['referee', []],
    ['court_display', []],
    ['main_display', []],
  ] as const)('shows only role-appropriate links for %s', (role, expectedRoutes) => {
    expect(getRoleShellNavItems('supabase', role).map((item) => item.to)).toEqual(expectedRoutes)
  })

  it('hides navigation until a Supabase profile is available', () => {
    expect(getRoleShellNavItems('supabase').map((item) => item.to)).toEqual([])
  })
})
