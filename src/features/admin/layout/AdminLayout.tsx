import { useEffect } from 'react'
import { TournamentSelector } from '../workspace/TournamentSelector'
import { AdminPreviewLinks } from '../preview/DevelopmentPreview'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { useTournamentTheme } from '../../../theme/themeContext'
import { useContext, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppBar, Box, Drawer, IconButton, Toolbar, Tooltip, Typography } from '@mui/material'
import Menu from '@mui/icons-material/Menu'
import { AdminNavigation } from './AdminSideNavigation'
import { TournamentLogo, StatusChip } from '../../../shared/components/Foundation'
import { AuthContext } from '../../auth/authContext'
import { LogoutButton } from '../../auth/LogoutButton'
export function AdminLayout() {
  const [open, setOpen] = useState(false)
  const auth = useContext(AuthContext)
  const { data: tournament, entry } = useAdminWorkspace()
  const { setPreset, setCustom } = useTournamentTheme()
  const preset = entry?.config.theme
  const custom = entry?.config.customColor
  useEffect(() => { if (preset) setPreset(preset); if (custom) setCustom(custom) }, [preset, custom, setPreset, setCustom])
  const allowed = auth?.status === 'authenticated' && auth.profile?.role === 'admin'
  const content = <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Box sx={{ p: 3 }}>
      <TournamentLogo />
      <Typography color="text.secondary" sx={{ fontSize: 13, my: 2 }}>{tournament.name}</Typography>
      <StatusChip label={entry?.config.status ?? 'draft'} />
    </Box>
    <AdminNavigation onNavigate={() => setOpen(false)} /><AdminPreviewLinks />
    <Box sx={{ mt: 'auto', p: 3 }}>{auth?.profile ? <LogoutButton /> : <Typography color="text.secondary" sx={{ fontSize: 13 }}>Demo / Area Admin</Typography>}</Box>
  </Box>
  return <Box className="admin-shell" sx={{ minHeight: '100svh', pl: { lg: allowed ? '272px' : 0 }, background: 'radial-gradient(ellipse at top right, var(--event-soft), transparent 50%)' }}>{allowed && <>
    <Drawer variant="permanent" sx={{ display: { xs: 'none', lg: 'block' }, '& .MuiDrawer-paper': { width: 272, borderRadius: 0 } }}>{content}</Drawer>
    <Drawer open={open} onClose={() => setOpen(false)} sx={{ display: { lg: 'none' }, '& .MuiDrawer-paper': { width: 280, borderRadius: 0 } }}>{content}</Drawer>
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ display: { lg: 'none' }, backdropFilter: 'blur(16px)' }}>
      <Toolbar>
        <Tooltip title="Apri navigazione admin">
          <IconButton aria-label="Apri navigazione admin" onClick={() => setOpen(true)}>
            <Menu />
          </IconButton>
        </Tooltip>
        <TournamentLogo />
      </Toolbar>
    </AppBar>
  </>}<Box sx={{ minWidth: 0 }}>
      <Box sx={{ p: { xs: 2, md: 4 }, pb: 0 }}><TournamentSelector /></Box>
      <Outlet />
    </Box>
  </Box>
}
