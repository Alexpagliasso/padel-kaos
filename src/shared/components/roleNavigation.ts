import { Activity, Crown, Radio, Shield, Trophy, Tv, type LucideIcon } from 'lucide-react'
import type { AppRole } from '../../features/auth/authIdentity'

export type RoleNavItem = {
  to: string
  label: string
  icon: LucideIcon
}

const allNavItems: RoleNavItem[] = [
  { to: '/admin', label: 'Admin', icon: Shield },
  { to: '/player', label: 'Player', icon: Crown },
  { to: '/referee', label: 'Referee', icon: Radio },
  { to: '/court-display', label: 'Court', icon: Tv },
  { to: '/main-display', label: 'Main', icon: Trophy },
]

export function getRoleShellNavItems(provider: 'demo' | 'supabase', role?: AppRole | null) {
  if (provider === 'demo') return allNavItems
  if (!role) return []

  if (role === 'admin') {
    return allNavItems.filter((item) => item.to === '/admin' || item.to === '/court-display' || item.to === '/main-display')
  }
  if (role === 'team') return allNavItems.filter((item) => item.to === '/player')
  if (role === 'referee') return allNavItems.filter((item) => item.to === '/referee')
  if (role === 'court_display') return allNavItems.filter((item) => item.to === '/court-display')
  return allNavItems.filter((item) => item.to === '/main-display')
}

export { Activity }
