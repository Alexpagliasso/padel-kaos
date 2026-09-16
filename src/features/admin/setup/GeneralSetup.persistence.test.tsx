// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyTournament, entryFromTournament } from '../workspace/workspaceStore'
import { TournamentThemeProvider } from '../../../theme/ThemeProvider'
import { GeneralSetup } from './GeneralSetup'

afterEach(cleanup)

function persistedEntry(id: string, teamsCount: number, goldQualifiedCount: number) {
  const tournament = {
    ...emptyTournament(id, `Tournament ${id}`), teamsCount, teamsPerGroup: 5,
    goldQualifiedCount, silverQualifiedCount: 4, courtsCount: 4,
    allowByes: true, themePreset: 'blue' as const, themeColor: null,
  }
  return entryFromTournament(tournament)
}

describe('persisted General Setup', () => {
  it('saves through the supplied application callback', async () => {
    const entry = persistedEntry('a', 30, 12)
    const onSave = vi.fn().mockResolvedValue([])
    render(<TournamentThemeProvider><GeneralSetup entry={entry} persisted onSave={onSave} /></TournamentThemeProvider>)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Available courts' }), { target: { value: 6 } })
    fireEvent.click(screen.getByRole('switch', { name: 'Allow BYEs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave.mock.calls[0][0].domain.id).toBe('a')
    expect(onSave.mock.calls[0][1]).toMatchObject({ teamsCount: 30, goldQualifiedCount: 12, courtsCount: 6, allowByes: false })
    expect(await screen.findByText('Configuration saved to Supabase.')).toBeTruthy()
  })
  it('resets its draft when the selected tournament key changes', () => {
    const a = persistedEntry('a', 30, 12)
    const b = persistedEntry('b', 20, 8)
    const view = render(<TournamentThemeProvider><GeneralSetup key="a" entry={a} persisted /></TournamentThemeProvider>)
    expect((screen.getByRole('spinbutton', { name: 'Number of teams' }) as HTMLInputElement).value).toBe('30')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Number of teams' }), { target: { value: 25 } })
    view.rerender(<TournamentThemeProvider><GeneralSetup key="b" entry={b} persisted /></TournamentThemeProvider>)
    expect((screen.getByRole('spinbutton', { name: 'Number of teams' }) as HTMLInputElement).value).toBe('20')
    expect((screen.getByRole('spinbutton', { name: 'Gold qualifiers' }) as HTMLInputElement).value).toBe('8')
    view.rerender(<TournamentThemeProvider><GeneralSetup key="a" entry={a} persisted /></TournamentThemeProvider>)
    expect((screen.getByRole('spinbutton', { name: 'Number of teams' }) as HTMLInputElement).value).toBe('30')
  })
  it('shows unsaved defaults for nullable server configuration and locks live tournaments', () => {
    const draft = entryFromTournament(emptyTournament('new', 'New tournament'))
    const view = render(<TournamentThemeProvider><GeneralSetup entry={draft} persisted /></TournamentThemeProvider>)
    expect(screen.getByText(/values shown are form defaults/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save configuration' }) as HTMLButtonElement).disabled).toBe(false)
    const live = persistedEntry('live', 20, 8)
    live.config = { ...live.config, status: 'live', started: true }
    view.rerender(<TournamentThemeProvider><GeneralSetup key="live" entry={live} persisted /></TournamentThemeProvider>)
    expect((screen.getByRole('spinbutton', { name: 'Number of teams' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Save configuration' })).toBeNull()
  })
})
