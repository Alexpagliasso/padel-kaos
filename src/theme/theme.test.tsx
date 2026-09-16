// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getContrastRatio, useTheme } from '@mui/material/styles'
import { TournamentThemeProvider } from './ThemeProvider'
import { Appearance } from '../features/admin/appearance/Appearance'
import { makePalette, tournamentPresets } from './tournamentPresets'
import { tokens } from './tokens'

afterEach(cleanup)
function Probe() { const theme = useTheme(); return <output aria-label="Active primary">{theme.palette.primary.main}</output> }
describe('tournament theme', () => {
  it('switches presets and custom immediately throughout the provider', () => {
    render(<TournamentThemeProvider><Appearance /><Probe /></TournamentThemeProvider>)
    for (const preset of tournamentPresets) {
      fireEvent.click(screen.getByRole('button', { name: preset.name }))
      expect(screen.getByRole('button', { name: preset.name }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByLabelText('Active primary').textContent).toBe(preset.primary)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('Custom tournament color'), { target: { value: '#aa33ff' } })
    expect(screen.getByLabelText('Active primary').textContent).toBe(makePalette('custom', 'Custom', '#aa33ff').primary)
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect((screen.getByLabelText('Custom tournament color') as HTMLInputElement).value).toBe('#aa33ff')
    fireEvent.click(screen.getByRole('button', { name: 'Ripristina Orange' }))
    expect(screen.getByRole('button', { name: 'Orange' }).getAttribute('aria-pressed')).toBe('true')
  })
  it.each(['#000000', '#ffffff', '#ff0000', '#0000ff', '#010102', 'invalid'])('keeps custom %s legible', color => {
    const palette = makePalette('custom', 'Custom', color)
    expect(getContrastRatio(palette.primary, tokens.surface)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(palette.primary, palette.contrastText)).toBeGreaterThanOrEqual(4.5)
  })
})
