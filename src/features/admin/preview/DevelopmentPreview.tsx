import { useContext, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'
import ArrowBack from '@mui/icons-material/ArrowBack'
import { AuthContext } from '../../auth/authContext'
import { canPreviewAsAdmin, canUseDevelopmentPreview, rolePreviewLinks } from './previewPolicy'
import { ProtectedRoute } from '../../auth/ProtectedRoute'
import type { AppRole } from '../../auth/authIdentity'

// Admin preview remains protected; no other role receives additional access.
export function AdminRolePreviewRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: AppRole[] }) {
  const auth = useContext(AuthContext)
  const preview = canPreviewAsAdmin(auth?.status, auth?.profile?.role)
  return <ProtectedRoute allowedRoles={preview ? [...allowedRoles, 'admin'] : allowedRoles}>{children}</ProtectedRoute>
}
export function AdminPreviewLinks() {
  const auth = useContext(AuthContext)
  if (auth?.status !== 'authenticated' || auth.profile?.role !== 'admin') return null
  return <Stack spacing={1} sx={{ px: 2, pb: 2 }}>
    <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 800, px: 1 }}>ROLE PREVIEWS</Typography>
    {rolePreviewLinks.map(link => <Button key={link.to} component={Link} to={link.to} sx={{ justifyContent: 'flex-start' }}>{link.label}</Button>)}
  </Stack>
}
// DEVELOPMENT ONLY: never expose this escape hatch to normal role accounts or production.
export function DevelopmentBackToAdmin({ development = import.meta.env.DEV }: { development?: boolean }) {
  const auth = useContext(AuthContext)
  const { pathname } = useLocation()
  if (!canUseDevelopmentPreview(development, auth?.status, auth?.profile?.role) || !rolePreviewLinks.some(link => pathname === link.to || pathname.startsWith(`${link.to}/`))) return null
  return <Button component={Link} to="/admin" variant="contained" size="small" startIcon={<ArrowBack />} sx={{ position: 'fixed', right: 16, bottom: { xs: 96, md: 20 }, zIndex: 1600, minHeight: 40, boxShadow: 4 }}>Back to Admin</Button>
}
