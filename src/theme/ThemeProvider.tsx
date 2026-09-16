import { useMemo, useState, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { MotionConfig } from 'framer-motion'
import { createTournamentTheme } from './createTournamentTheme'
import { TournamentThemeContext } from './themeContext'
import type { PresetId } from './tournamentPresets'
export function TournamentThemeProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<PresetId>('orange')
  const [custom, setCustom] = useState('#b18cff')
  const theme = useMemo(() => createTournamentTheme(preset, custom), [preset, custom])
  return <TournamentThemeContext.Provider value={{ preset, custom, setPreset, setCustom }}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeProvider>
  </TournamentThemeContext.Provider>
}
