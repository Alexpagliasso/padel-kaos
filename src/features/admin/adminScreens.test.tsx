import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createDemoTournament } from '../../demo/demoSeed'
import { createEmptyTournamentDomain } from '../../repositories/supabase/mappers/tournamentMapper'
import { MainDisplayContent } from '../../routes/MainDisplayRoute'
import { ControlRoomContent } from './control-room/ControlRoom'
import { TournamentSetupContent } from './setup/TournamentSetup'

describe('admin screens', () => {
  it('renders /admin/setup content', () => {
    const html = renderToStaticMarkup(<TournamentSetupContent tournament={createDemoTournament()} />)

    expect(html).toContain('Tournament Setup')
    expect(html).toContain('TOURNAMENT')
  })

  it('renders /admin/control-room without a round', () => {
    const html = renderToStaticMarkup(
      <ControlRoomContent
        tournament={createEmptyTournamentDomain('Empty Control Room')}
        porTresPrizeDraft="Prize"
        onPorTresPrizeChange={vi.fn()}
        onActivatePorTres={vi.fn()}
        onRollGlobalDice={vi.fn()}
      />,
    )

    expect(html).toContain('No round configured')
    expect(html).toContain('No matches configured')
  })

  it('renders ControlRoom with a match', () => {
    const html = renderToStaticMarkup(
      <ControlRoomContent
        tournament={createDemoTournament()}
        porTresPrizeDraft="Prize"
        onPorTresPrizeChange={vi.fn()}
        onActivatePorTres={vi.fn()}
        onRollGlobalDice={vi.fn()}
      />,
    )

    expect(html).toContain('Field Status')
    expect(html).toContain('TEAM RED')
  })

  it('renders main display as a read-only board', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MainDisplayContent tournament={createDemoTournament()} />
      </MemoryRouter>,
    )

    expect(html).toContain('PADEL KAOS LIVE')
    expect(html).not.toContain('ACTIVATE')
    expect(html).not.toContain('ROLL GLOBAL DICE')
  })

  it('renders empty main display state without crashing', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MainDisplayContent tournament={createEmptyTournamentDomain()} />
      </MemoryRouter>,
    )

    expect(html).toContain('No matches configured')
  })
})
