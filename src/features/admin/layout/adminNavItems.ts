import Dashboard from '@mui/icons-material/Dashboard'
import Settings from '@mui/icons-material/Settings'
import Groups from '@mui/icons-material/Groups'
import AccountTree from '@mui/icons-material/AccountTree'
import Sports from '@mui/icons-material/Sports'
import Key from '@mui/icons-material/Key'
import Palette from '@mui/icons-material/Palette'
import Restore from '@mui/icons-material/Restore'
import CalendarMonth from '@mui/icons-material/CalendarMonth'
import Leaderboard from '@mui/icons-material/Leaderboard'
import FactCheck from '@mui/icons-material/FactCheck'
export const adminNavigationItems = [
  { to: '/admin', label: 'Panoramica', icon: Dashboard, end: true },
  { to: '/admin/setup', label: 'Configurazione', icon: Settings },
  { to: '/admin/teams', label: 'Squadre', icon: Groups },
  { to: '/admin/groups', label: 'Gironi', icon: AccountTree },
  { to: '/admin/calendar', label: 'Calendario', icon: CalendarMonth },
  { to: '/admin/standings', label: 'CLASSIFICHE', icon: Leaderboard },
  { to: '/admin/results', label: 'RISULTATI', icon: FactCheck },
  { to: '/admin/control-room', label: 'Regia', icon: Sports },
  { to: '/admin/access', label: 'Accessi', icon: Key },
  { to: '/admin/appearance', label: 'Aspetto', icon: Palette },
  { to: '/admin/recovery', label: 'Ripristino', icon: Restore },
]
