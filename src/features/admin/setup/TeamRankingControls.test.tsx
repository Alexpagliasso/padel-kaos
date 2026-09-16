// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TeamRepositoryContract } from '../../../repositories/contracts'
import type { Team, Tournament } from '../../../shared/types/domain'
import { TeamRankingActions, TeamRankingEditor } from './TeamRankingControls'

const team: Team = { id: 'team-a', name: 'Squadra A', shortName: 'A', color: '#fff', groupId: '', ranking: 2, players: [] }
const tournament = { id: 'tournament-a', name: 'Torneo A', status: 'draft', teams: [team] } as Tournament
const baseRepository: TeamRepositoryContract = { createTeam: vi.fn(), updateTeam: vi.fn() }

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('controlli ranking squadre', () => {
  it('salva un ranking intero e rimuove il ranking inviando null', async () => {
    const setTeamRanking = vi.fn().mockResolvedValue(undefined)
    render(<TeamRankingEditor tournament={tournament} team={team} repository={{ ...baseRepository, setTeamRanking }} onMessage={vi.fn()} onError={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Ranking Squadra A'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva ranking' }))
    await waitFor(() => expect(setTeamRanking).toHaveBeenCalledWith('tournament-a', 'team-a', 4))
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi ranking' }))
    await waitFor(() => expect(setTeamRanking).toHaveBeenCalledWith('tournament-a', 'team-a', null))
  })

  it('conferma e usa una sola assegnazione casuale bulk', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const assignRandomTeamRankings = vi.fn().mockResolvedValue(undefined)
    render(<TeamRankingActions tournament={tournament} repository={{ ...baseRepository, assignRandomTeamRankings }} onMessage={vi.fn()} onError={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Assegna ranking casuale' }))
    await waitFor(() => expect(assignRandomTeamRankings).toHaveBeenCalledOnce())
    expect(assignRandomTeamRankings).toHaveBeenCalledWith('tournament-a')
  })

  it('disabilita ogni modifica quando il torneo è in corso', () => {
    const live = { ...tournament, status: 'live' as const }
    const repository = { ...baseRepository, setTeamRanking: vi.fn(), assignRandomTeamRankings: vi.fn() }
    render(<><TeamRankingActions tournament={live} repository={repository} onMessage={vi.fn()} onError={vi.fn()} /><TeamRankingEditor tournament={live} team={team} repository={repository} onMessage={vi.fn()} onError={vi.fn()} /></>)
    expect((screen.getByRole('button', { name: 'Assegna ranking casuale' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Ranking Squadra A') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Rimuovi ranking' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
