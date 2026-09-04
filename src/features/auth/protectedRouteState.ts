import type { AppRole } from './authIdentity'
import { getDefaultRouteForRole, roleCanAccessRoute } from './authIdentity'

export type ProtectedRouteDecision =
  | { type: 'allow' }
  | { type: 'loading' }
  | { type: 'login' }
  | { type: 'redirect'; to: string }

export function getProtectedRouteDecision(input: {
  provider: 'demo' | 'supabase'
  status: 'loading' | 'authenticated' | 'unauthenticated'
  role?: AppRole
  allow: 'admin' | 'referee' | 'player' | 'court_display' | 'main_display'
}): ProtectedRouteDecision {
  if (input.provider === 'demo') return { type: 'allow' }
  if (input.status === 'loading') return { type: 'loading' }
  if (!input.role) return { type: 'login' }
  if (!roleCanAccessRoute(input.role, input.allow)) return { type: 'redirect', to: getDefaultRouteForRole(input.role) }
  return { type: 'allow' }
}
