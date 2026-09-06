import { describe, expect, it } from 'vitest'
import { getRoleShellNavItems } from './roleNavigation'

describe('getRoleShellNavItems', () => {
  it('keeps all navigation available in demo mode', () => {
    expect(getRoleShellNavItems('demo').map((item) => item.to)).toEqual([
      '/admin',
      '/player',
      '/referee',
      '/court-display',
      '/main-display',
    ])
  })

  it.each([
    ['admin', ['/admin', '/court-display', '/main-display']],
    ['team', ['/player']],
    ['referee', ['/referee']],
    ['court_display', ['/court-display']],
    ['main_display', ['/main-display']],
  ] as const)('shows only role-appropriate links for %s', (role, expectedRoutes) => {
    expect(getRoleShellNavItems('supabase', role).map((item) => item.to)).toEqual(expectedRoutes)
  })

  it('hides navigation until a Supabase profile is available', () => {
    expect(getRoleShellNavItems('supabase').map((item) => item.to)).toEqual([])
  })
})
