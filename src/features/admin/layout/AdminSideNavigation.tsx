import { NavLink, useLocation } from 'react-router-dom'
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material'
import { adminNavigationItems } from './adminNavItems'
export function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  return <List component="nav" aria-label="Navigazione Admin" sx={{ p: 2 }}>{adminNavigationItems.map(item => <ListItemButton key={item.to} component={NavLink} to={item.to} end={item.end} selected={item.end ? pathname === item.to : pathname.startsWith(item.to)} onClick={onNavigate} sx={{ mb: .5 }}>
    <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
      <item.icon fontSize="small" />
    </ListItemIcon>
    <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 750, fontSize: 14 } } }} />
  </ListItemButton>)}</List>
}
