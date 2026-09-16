import { createContext, useContext } from 'react'
import type { PresetId } from './tournamentPresets'
export const TournamentThemeContext = createContext({ preset: 'orange' as PresetId, custom: '#b18cff', setPreset: (_value: PresetId) => { void _value }, setCustom: (_value: string) => { void _value } })
export const useTournamentTheme = () => useContext(TournamentThemeContext)
