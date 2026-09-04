import { DatabaseBackup, Gauge, KeyRound, Settings2, TowerControl } from 'lucide-react'

export const adminNavigationItems = [
  { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/admin/setup', label: 'Setup', icon: Settings2 },
  { to: '/admin/control-room', label: 'Control Room', icon: TowerControl },
  { to: '/admin/access', label: 'Access', icon: KeyRound },
  { to: '/admin/recovery', label: 'Recovery', icon: DatabaseBackup },
]
