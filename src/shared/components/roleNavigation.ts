import { Activity, Crown, Radio, Shield, Trophy, Tv, type LucideIcon } from 'lucide-react'
import type { AppRole } from '../../features/auth/authIdentity'

export type RoleNavItem = {
  to: string
  label: string
  icon: LucideIcon
}

const allNavItems: RoleNavItem[] = [
  { to: '/admin', label: 'Admin', icon: Shield },
  { to: '/player', label: 'Giocatore', icon: Crown },
  { to: '/referee', label: 'Arbitro', icon: Radio },
  { to: '/court-display', label: 'Campo', icon: Tv },
  { to: '/main-display', label: 'Principale', icon: Trophy },
]

export function getRoleShellNavItems(_provider: 'demo' | 'supabase', role?: AppRole | null) {
  return role === 'admin' ? allNavItems.filter(item => item.to === '/admin' || item.to === '/court-display' || item.to === '/main-display') : []
}
export { Activity }
