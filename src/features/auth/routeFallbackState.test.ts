import { describe, expect, it } from 'vitest'
import { getRouteFallbackDecision } from './routeFallbackState'

describe('getRouteFallbackDecision', () => {
  it.each([
    ['admin', '/admin'],
    ['team', '/player'],
    ['referee', '/referee'],
    ['court_display', '/court-display'],
    ['main_display', '/main-display'],
  ] as const)('redirects authenticated %s users to their default route', (role, to) => {
    expect(getRouteFallbackDecision({
      provider: 'supabase',
      status: 'authenticated',
      role,
    })).toEqual({ type: 'redirect', to })
  })

  it('redirects unauthenticated unknown routes to login', () => {
    expect(getRouteFallbackDecision({
      provider: 'supabase',
      status: 'unauthenticated',
    })).toEqual({ type: 'redirect', to: '/login' })
  })

  it('does not redirect while auth is loading', () => {
    expect(getRouteFallbackDecision({
      provider: 'supabase',
      status: 'loading',
    })).toEqual({ type: 'loading' })
  })
})
