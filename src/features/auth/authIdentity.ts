import { z } from 'zod'

export type AppRole = 'admin' | 'referee' | 'team' | 'court_display' | 'main_display'

export type AppProfile = {
  id: string
  tournamentId: string
  role: AppRole
  username: string
  displayName: string
  teamId?: string | null
  courtId?: string | null
}

export const provisionableRoleSchema = z.enum(['referee', 'team', 'court_display', 'main_display'])
export type ProvisionableRole = z.infer<typeof provisionableRoleSchema>

export const authProfileSchema = z.object({
  id: z.string().min(1),
  tournament_id: z.string().min(1),
  role: z.enum(['admin', 'referee', 'team', 'court_display', 'main_display']),
  username: z.string().min(1),
  display_name: z.string().min(1),
  team_id: z.string().nullable().optional(),
  court_id: z.string().nullable().optional(),
})

export function mapProfile(row: z.infer<typeof authProfileSchema>): AppProfile {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    role: row.role,
    username: row.username,
    displayName: row.display_name,
    teamId: row.team_id,
    courtId: row.court_id,
  }
}

export function getAuthTournamentSlug() {
  return normalizeAuthSlug(import.meta.env.VITE_AUTH_TOURNAMENT_SLUG || 'padel-kaos')
}

export function usernameToTechnicalEmail(username: string, tournamentSlug = getAuthTournamentSlug()) {
  const normalizedUsername = normalizeAuthSlug(username)
  const normalizedTournament = normalizeAuthSlug(tournamentSlug)
  if (!normalizedUsername || !normalizedTournament) {
    throw new Error('Invalid username')
  }
  return `${normalizedUsername}.${normalizedTournament}@auth.padelkaos.internal`
}

export function getDefaultRouteForRole(role: AppRole) {
  if (role === 'admin') return '/admin'
  if (role === 'referee') return '/referee'
  if (role === 'team') return '/player'
  if (role === 'court_display') return '/court-display'
  return '/main-display'
}

export type RouteAccessKey = 'admin' | 'referee' | 'player' | 'court_display' | 'main_display'

export const routeAccessMatrix: Record<RouteAccessKey, AppRole[]> = {
  admin: ['admin'],
  referee: ['referee'],
  player: ['team'],
  court_display: ['court_display', 'admin'],
  main_display: ['main_display', 'admin'],
}

export function getAllowedRolesForRoute(route: RouteAccessKey) {
  return routeAccessMatrix[route]
}

export function roleCanAccessRoute(role: AppRole, route: RouteAccessKey) {
  return getAllowedRolesForRoute(route).includes(role)
}

export function normalizeAuthSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
