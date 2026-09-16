import { alpha, darken, lighten, getContrastRatio } from '@mui/material/styles'
import { tokens } from './tokens'
export type PresetId = 'white' | 'blue' | 'orange' | 'green' | 'custom'
export function makePalette(id: PresetId, name: string, color: string) {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ff9955'
  let primary = base
  for (let i = 0; getContrastRatio(primary, tokens.surface) < 4.5 && i < 20; i++) primary = lighten(primary, .12)
  const contrastText = getContrastRatio(primary, '#090c10') >= 4.5 ? '#090c10' : '#ffffff'
  const accent = lighten(primary, .35)
  return { id, name, primary, primaryLight: lighten(primary, .2), primaryDark: darken(primary, .25), accent,
    gradient: `linear-gradient(125deg, ${alpha(primary, .22)}, ${tokens.surface} 75%)`,
    glow: `0 0 32px ${alpha(primary, .22)}`, contrastText,
    background: tokens.background, surface: tokens.surface, raised: tokens.raised, status: tokens.status }
}
export const tournamentPresets = [makePalette('white', 'White', '#f2f5f7'), makePalette('blue', 'Blue', '#70b8ff'), makePalette('orange', 'Orange', '#ff9955'), makePalette('green', 'Green', '#7cea9c')]
export function resolvePalette(id: PresetId, custom: string) {
  return id === 'custom' ? makePalette('custom', 'Custom', custom) : tournamentPresets.find(preset => preset.id === id) ?? tournamentPresets[2]
}
