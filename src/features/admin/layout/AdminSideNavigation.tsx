import { NavLink, useLocation } from 'react-router-dom'
import { List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import { adminNavigationItems } from './adminNavItems'
export function AdminNavigation({ onNavigate, hasTournament = true }: { onNavigate?: () => void; hasTournament?: boolean }) {
  const { pathname } = useLocation()
  const visible=adminNavigationItems.filter(item=>!item.requiresTournament||hasTournament)
  return <List component="nav" aria-label="Navigazione Admin" sx={{ p: 2 }}>{visible.map((item,index) => {const heading=index===0||visible[index-1].area!==item.area;return <span key={item.to}>{heading&&<Typography component="div" variant="overline" sx={{display:'block',px:2,pt:index?2:0,pb:.5,color:'text.secondary'}}>{item.area}</Typography>}<ListItemButton component={NavLink} to={item.to} selected={pathname.startsWith(item.to)} onClick={onNavigate} sx={{ mb: .5 }}>
    <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
      <item.icon fontSize="small" />
    </ListItemIcon>
    <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 750, fontSize: 14 } } }} />
  </ListItemButton></span>})}</List>
}
