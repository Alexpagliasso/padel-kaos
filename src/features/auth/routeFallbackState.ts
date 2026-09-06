import type { AppRole } from './authIdentity'
import { getDefaultRouteForRole } from './authIdentity'

export type RouteFallbackDecision =
  | { type: 'loading' }
  | { type: 'redirect'; to: string }

export function getRouteFallbackDecision(input: {
  provider: 'demo' | 'supabase'
  status: 'loading' | 'authenticated' | 'unauthenticated'
  role?: AppRole
}): RouteFallbackDecision {
  if (input.provider === 'demo') return { type: 'redirect', to: '/admin' }
  if (input.status === 'loading') return { type: 'loading' }
  if (!input.role) return { type: 'redirect', to: '/login' }
  return { type: 'redirect', to: getDefaultRouteForRole(input.role) }
}
