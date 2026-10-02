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
import DeleteSweep from '@mui/icons-material/DeleteSweep'
import AutoAwesome from '@mui/icons-material/AutoAwesome'
import LibraryBooks from '@mui/icons-material/LibraryBooks'
import type { SvgIconComponent } from '@mui/icons-material'
export type AdminNavigationItem={to:string;label:string;icon:SvgIconComponent;area:'Libreria globale'|'I miei tornei'|'Regia torneo';requiresTournament?:boolean}
export const adminNavigationItems:AdminNavigationItem[] = [
  { to: '/admin/library', label: 'Catalogo predefinito', icon: LibraryBooks, area: 'Libreria globale' },
  { to: '/admin/tournaments', label: 'I miei tornei', icon: DeleteSweep, area: 'I miei tornei' },
  { to: '/admin/new', label: 'Nuovo torneo', icon: AutoAwesome, area: 'I miei tornei' },
  { to: '/admin/setup', label: 'Configurazione', icon: Settings, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/teams', label: 'Squadre', icon: Groups, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/groups', label: 'Gironi', icon: AccountTree, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/calendar', label: 'Calendario', icon: CalendarMonth, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/standings', label: 'Classifiche', icon: Leaderboard, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/results', label: 'Risultati', icon: FactCheck, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/control-room', label: 'Regia', icon: Sports, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/access', label: 'Accessi', icon: Key, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/appearance', label: 'Aspetto', icon: Palette, area: 'Regia torneo', requiresTournament: true },
  { to: '/admin/recovery', label: 'Ripristino', icon: Restore, area: 'Regia torneo', requiresTournament: true },
]
