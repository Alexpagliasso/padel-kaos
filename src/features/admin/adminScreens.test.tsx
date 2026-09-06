import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createDemoTournament } from '../../demo/demoSeed'
import { createEmptyTournamentDomain } from '../../repositories/supabase/mappers/tournamentMapper'
import { MainDisplayContent } from '../../routes/MainDisplayRoute'
import { ControlRoomContent } from './control-room/ControlRoom'
import { TournamentSetupContent } from './setup/TournamentSetup'

describe('admin screens', () => {
  it('renders /admin/setup content', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TournamentSetupContent tournament={createDemoTournament()} />
      </QueryClientProvider>,
    )

    expect(html).toContain('Tournament Setup')
    expect(html).toContain('TOURNAMENT')
  })

  it('renders team creation with access credentials in the Teams tab', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TournamentSetupContent tournament={createDemoTournament()} initialTab="TEAMS" enableTeamAccess />
      </QueryClientProvider>,
    )

    expect(html).toContain('Team access')
    expect(html).toContain('Username')
    expect(html).toContain('Password is generated automatically server-side.')
    expect(html).toContain('Download All Team Credentials')
    expect(html).toContain('0 credentials ready')
    expect(html).toContain('Create Team + Login')
    expect(html).not.toContain('Manual password')
    expect(html).not.toContain('Confirm password')
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
