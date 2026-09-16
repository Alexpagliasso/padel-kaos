import type { AppRole } from '../../auth/authIdentity'
export function canPreviewAsAdmin(status?: string, role?: AppRole | null) {
  return status === 'authenticated' && role === 'admin'
}
export function canUseDevelopmentPreview(development: boolean, status?: string, role?: AppRole | null) {
  return development && canPreviewAsAdmin(status, role)
}
export const rolePreviewLinks = [
  { to: '/player', label: 'Giocatore' }, { to: '/referee', label: 'Arbitro' },
  { to: '/court-display', label: 'Schermo campo' }, { to: '/main-display', label: 'Schermo principale' },
]
