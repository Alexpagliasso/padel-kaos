import { describe, expect, it } from 'vitest'
import { getProtectedRouteDecision } from './protectedRouteState'

describe('getProtectedRouteDecision', () => {
  it('protects admin routes for authenticated admins', () => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'authenticated',
      role: 'admin',
      allow: 'admin',
    })).toEqual({ type: 'allow' })
  })

  it('allows admin preview for display routes', () => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'authenticated',
      role: 'admin',
      allow: 'main_display',
    })).toEqual({ type: 'allow' })
  })

  it('redirects unauthenticated users to login', () => {
    expect(getProtectedRouteDecision({
      provider: 'supabase',
      status: 'unauthenticated',
      allow: 'admin',
    })).toEqual({ type: 'login' })
  })
})
