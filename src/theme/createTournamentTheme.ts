import { alpha, createTheme } from '@mui/material/styles'
import { resolvePalette, type PresetId } from './tournamentPresets'
import { tokens } from './tokens'
import { typography } from './typography'
export function createTournamentTheme(id: PresetId = 'orange', custom = '#b18cff') {
  const p = resolvePalette(id, custom)
  return createTheme({
    palette: { mode: 'dark', primary: { main: p.primary, light: p.primaryLight, dark: p.primaryDark, contrastText: p.contrastText }, secondary: { main: p.accent }, background: { default: p.background, paper: p.surface }, text: { primary: '#f5f7fa', secondary: '#afbdca' }, divider: tokens.border,
      success: { main: p.status.success }, warning: { main: p.status.warning }, error: { main: p.status.error }, info: { main: p.status.info } },
    spacing: tokens.spacing, shape: { borderRadius: tokens.radius }, typography,
    transitions: { duration: { short: 150, standard: tokens.duration, enteringScreen: 250, leavingScreen: 150 } },
    components: {
      MuiCssBaseline: { styleOverrides: { ':root': { '--event-primary': p.primary, '--event-contrast': p.contrastText, '--event-gradient': p.gradient, '--event-glow': p.glow, '--event-soft': alpha(p.primary, .12) }, body: { background: p.background }, '::selection': { background: p.primary, color: p.contrastText } } },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none', border: `1px solid ${tokens.border}` } } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 48, borderRadius: 14, paddingInline: 20, '&:hover': { boxShadow: p.glow } } } },
      MuiIconButton: { styleOverrides: { root: { minWidth: 48, minHeight: 48 } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 800, borderRadius: 8 } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, minHeight: 48 } } },
      MuiListItemButton: { styleOverrides: { root: { minHeight: 48, borderRadius: 12, '&.Mui-selected': { background: alpha(p.primary, .14), color: p.primary } } } },
    },
  })
}
