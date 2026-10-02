// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoTournament } from '../../../demo/demoSeed'
import type { Tournament } from '../../../shared/types/domain'
import type { ExistingProvisionedAccount } from '../../auth/accessManagementState'
import type { TournamentAccessApi } from './TournamentAccessManager'
import { TournamentAccessManager } from './TournamentAccessManager'

function tournament(id = 'tournament-access'): Tournament {
  const value = createDemoTournament()
  return {
    ...value,
    id,
    name: `Torneo ${id}`,
    teams: value.teams.slice(0, 2).map((team, index) => ({ ...team, id: `team-${id}-${index}`, name: index ? 'Smash Club' : 'Kaos Academy' })),
    courts: value.courts.slice(0, 2).map((court, index) => ({ ...court, id: `court-${id}-${index}`, name: `Campo ${index + 1}` })),
  }
}

function api(overrides: Partial<TournamentAccessApi> = {}): TournamentAccessApi {
  return {
    list: vi.fn(async () => []),
    provision: vi.fn(async input => ({ username: input.username, temporaryPassword: 'Temp123456!', role: input.role, teamId: input.teamId, courtId: input.courtId, teamName: input.teamName })),
    resetPassword: vi.fn(async () => ({ username: 'kaos_academy', temporaryPassword: 'Nuova123456!', role: 'team' as const })),
    replaceRefereeCourts: vi.fn(async () => undefined),
    ...overrides,
  }
}

afterEach(cleanup)

describe('TournamentAccessManager', () => {
  it('renders real tournament teams and never exposes the legacy Team Red/Blue presets', async () => {
    render(<TournamentAccessManager tournament={tournament()} api={api()} />)
    expect(await screen.findByText('Kaos Academy')).toBeTruthy()
    expect(screen.getByText('Smash Club')).toBeTruthy()
    expect(screen.queryByText('Team Red')).toBeNull()
    expect(screen.queryByText('Team Blue')).toBeNull()
  })

  it('distinguishes existing and missing team, court and display accounts', async () => {
    const current = tournament()
    const accessApi = api({ list: vi.fn(async (): Promise<ExistingProvisionedAccount[]> => [
      { id: 'team-login', role: 'team', username: 'kaos', displayName: 'Kaos Academy', teamId: current.teams[0].id },
      { id: 'court-login', role: 'court_display', username: 'court_1', displayName: 'Schermo Campo 1', courtId: current.courts[0].id },
      { id: 'main-login', role: 'main_display', username: 'main', displayName: 'Main display' },
    ]) })
    render(<TournamentAccessManager tournament={current} api={accessApi} />)
    expect(await screen.findByText('kaos')).toBeTruthy()
    expect(screen.getByText('court_1')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getAllByText('ACCESSO MANCANTE').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('PRONTO').length).toBe(3)
  })

  it('creates a missing real team account and shows its password only in transient UI state', async () => {
    const current = tournament()
    const accessApi = api()
    render(<TournamentAccessManager tournament={current} api={accessApi} />)
    await screen.findAllByText('Kaos Academy')
    fireEvent.click(screen.getAllByRole('button', { name: /crea accesso/i })[0])
    expect(await screen.findByRole('region', { name: 'Credenziali temporanee' })).toBeTruthy()
    expect(screen.getByText('Temp123456!')).toBeTruthy()
    expect(accessApi.provision).toHaveBeenCalledWith(expect.objectContaining({ tournamentId: current.id, teamId: current.teams[0].id, role: 'team' }))
    fireEvent.click(screen.getByRole('button', { name: 'CHIUDI' }))
    expect(screen.queryByText('Temp123456!')).toBeNull()
  })

  it('resets an existing password through the authorized API and reveals the new credential once', async () => {
    const current = tournament()
    const accessApi = api({ list: vi.fn(async (): Promise<ExistingProvisionedAccount[]> => [{ id: 'team-login', role: 'team', username: 'kaos', displayName: 'Kaos Academy', teamId: current.teams[0].id }]) })
    render(<TournamentAccessManager tournament={current} api={accessApi} />)
    await screen.findByText('kaos')
    fireEvent.click(screen.getAllByRole('button', { name: /reimposta password/i })[0])
    expect(await screen.findByText('Nuova123456!')).toBeTruthy()
    expect(accessApi.resetPassword).toHaveBeenCalledWith(current.id, 'team-login')
  })

  it('shows safe errors and reloads accounts when the selected tournament changes', async () => {
    const list = vi.fn(async (id: string) => {
      if (id === 'first') throw new Error('Servizio temporaneamente non disponibile')
      return [{ id: 'next-team', role: 'team' as const, username: 'next_login', displayName: 'Kaos Academy', teamId: `team-${id}-0` }]
    })
    const accessApi = api({ list })
    const view = render(<TournamentAccessManager tournament={tournament('first')} api={accessApi} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Servizio temporaneamente non disponibile')
    view.rerender(<TournamentAccessManager tournament={tournament('second')} api={accessApi} />)
    expect(await screen.findByText('next_login')).toBeTruthy()
    await waitFor(() => expect(list).toHaveBeenCalledWith('second'))
  })
})
