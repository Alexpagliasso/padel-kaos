import { describe, expect, it } from 'vitest'
import { getProtectedRouteDecision } from './protectedRouteState'

describe('getProtectedRouteDecision', () => {
  it.each([
    ['admin', ['admin'], { type: 'allow' }],
    ['team', ['team'], { type: 'allow' }],
    ['referee', ['referee'], { type: 'allow' }],
    ['court_display', ['court_display', 'admin'], { type: 'allow' }],
    ['main_display', ['main_display', 'admin'], { type: 'allow' }],
  ] as const)('allows %s on its authorized route', (role, allowedRoles, expected) => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'authenticated',
      role,
      allowedRoles: [...allowedRoles],
    })).toEqual(expected)
  })

  it.each([
    ['team', ['admin'], '/player'],
    ['team', ['referee'], '/player'],
    ['team', ['court_display', 'admin'], '/player'],
    ['team', ['main_display', 'admin'], '/player'],
    ['referee', ['admin'], '/referee'],
    ['court_display', ['admin'], '/court-display'],
    ['main_display', ['admin'], '/main-display'],
  ] as const)('redirects %s away from unauthorized routes', (role, allowedRoles, to) => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'authenticated',
      role,
      allowedRoles: [...allowedRoles],
    })).toEqual({ type: 'redirect', to })
  })

  it('allows admin display previews', () => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'authenticated',
      role: 'admin',
      allowedRoles: ['main_display', 'admin'],
    })).toEqual({ type: 'allow' })

    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'authenticated',
      role: 'admin',
      allowedRoles: ['court_display', 'admin'],
    })).toEqual({ type: 'allow' })
  })

  it('redirects unauthenticated users to login without rendering the route', () => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'unauthenticated',
      allowedRoles: ['admin'],
    })).toEqual({ type: 'login' })
  })

  it('blocks protected routes after the session is removed', () => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'unauthenticated',
      allowedRoles: ['team'],
    })).toEqual({ type: 'login' })
  })

  it('waits while auth restores', () => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'loading',
      allowedRoles: ['admin'],
    })).toEqual({ type: 'loading' })
  })

  it('keeps demo provider permissive for local workflows', () => {
    expect(getProtectedRouteDecision({
      provider: 'demo',
      status: 'unauthenticated',
      allowedRoles: ['admin'],
    })).toEqual({ type: 'allow' })
  })
})
