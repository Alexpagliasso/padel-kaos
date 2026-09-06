import type { AppRole } from './authIdentity'
import { getDefaultRouteForRole } from './authIdentity'

export type ProtectedRouteDecision =
  | { type: 'allow' }
  | { type: 'loading' }
  | { type: 'login' }
  | { type: 'redirect'; to: string }

export function getProtectedRouteDecision(input: {
  provider: 'demo' | 'supabase'
  status: 'loading' | 'authenticated' | 'unauthenticated'
  role?: AppRole
  allowedRoles: AppRole[]
}): ProtectedRouteDecision {
  if (input.provider === 'demo') return { type: 'allow' }
  if (input.status === 'loading') return { type: 'loading' }
  if (!input.role) return { type: 'login' }
  if (!input.allowedRoles.includes(input.role)) return { type: 'redirect', to: getDefaultRouteForRole(input.role) }
  return { type: 'allow' }
}
