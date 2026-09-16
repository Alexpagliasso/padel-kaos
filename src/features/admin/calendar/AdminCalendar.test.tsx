// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoTournament } from '../../../demo/demoSeed'
import { createInitialScore } from '../../../domain/scoring/scoreEngine'
import type { GlobalTurn } from '../../../domain/tournament/groupScheduleEngine'
import type { Tournament } from '../../../shared/types/domain'

const mocks = vi.hoisted(() => ({ management: null as unknown as Record<string, unknown> }))

vi.mock('../../../repositories/scheduleRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../repositories/scheduleRepository')>()),
  useScheduleManagement: () => mocks.management,
}))

import { AdminCalendar } from './AdminCalendar'

afterEach(cleanup)

function readyTournament(): Tournament {
  const tournament = createDemoTournament()
  return {
    ...tournament,
    status: 'configured',
    courtsCount: 1,
    groups: [{ ...tournament.groups[0], sortOrder: 0, assignedCourtId: tournament.courts[0].id }],
    rounds: [],
    matches: [],
  }
}

function withPersistedSchedule(tournament: Tournament, turns: GlobalTurn[]): Tournament {
  const rounds = turns.map((turn) => ({
    id: `persisted-round-${turn.sequence}`, tournamentId: tournament.id,
    name: `Turno ${turn.sequence}`, stage: 'group' as const, sequence: turn.sequence, status: 'scheduled' as const,
  }))
  return {
    ...tournament,
    rounds,
    matches: turns.flatMap((turn) => turn.matches.map((match, index) => ({
      id: `persisted-match-${turn.sequence}-${index}`,
      roundId: `persisted-round-${turn.sequence}`,
      groupId: match.groupId,
      courtId: match.courtId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      status: 'scheduled' as const,
      score: createInitialScore(),
      lineups: [],
      activeCardUsageIds: [],
    }))),
  }
}

function management(data: Tournament, save: (turns: GlobalTurn[]) => Promise<void>, error = '') {
  return {
    data,
    entry: { domain: data },
    remote: true,
    isLoading: false,
    error,
    referees: [{ id: 'referee-1', courtId: data.courts[0].id, name: 'Arbitro Uno' }],
    refereesLoading: false,
    refereesError: '',
    save,
    assignCourt: vi.fn(),
  }
}

describe('AdminCalendar persisted state', () => {
  it('marks a generated preview as unsaved, persists it, and reconstructs it after remount', async () => {
    let tournament = readyTournament()
    const save = vi.fn(async (turns: GlobalTurn[]) => {
      tournament = withPersistedSchedule(tournament, turns)
      mocks.management = management(tournament, save)
    })
    mocks.management = management(tournament, save)
    const view = render(<AdminCalendar />)

    expect(screen.getByText('Nessun calendario salvato')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Genera anteprima' }))
    expect(screen.getByText('Anteprima non salvata')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salva calendario' }))

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    await screen.findByText('Calendario salvato.')
    view.rerender(<AdminCalendar />)
    expect(screen.getByRole('heading', { name: 'Calendario salvato' })).toBeTruthy()

    view.unmount()
    render(<AdminCalendar />)
    expect(screen.getByRole('heading', { name: 'Calendario salvato' })).toBeTruthy()
    expect(screen.queryByText('Anteprima non salvata')).toBeNull()
  })

  it('shows save and persisted-load failures with distinct Italian messages', async () => {
    const tournament = readyTournament()
    mocks.management = management(tournament, vi.fn().mockRejectedValue(new Error('Impossibile salvare il calendario')))
    const view = render(<AdminCalendar />)

    fireEvent.click(screen.getByRole('button', { name: 'Genera anteprima' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salva calendario' }))
    expect(await screen.findByText('Impossibile salvare il calendario')).toBeTruthy()

    view.unmount()
    mocks.management = management(tournament, vi.fn(), 'permission denied')
    render(<AdminCalendar />)
    expect(screen.getByText('Impossibile caricare il calendario salvato')).toBeTruthy()
  })
})
