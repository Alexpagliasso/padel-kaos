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
  const renderScreen = (content: React.ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{content}</QueryClientProvider>)
  it('renders /admin/setup content', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TournamentSetupContent tournament={createDemoTournament()} />
      </QueryClientProvider>,
    )

    expect(html).toContain('Configurazione torneo')
    expect(html).toContain('TOURNAMENT')
  })

  it('renders team creation with access credentials in the Teams tab', () => {
    const queryClient = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TournamentSetupContent tournament={createDemoTournament()} initialTab="TEAMS" enableTeamAccess />
      </QueryClientProvider>,
    )

    expect(html).toContain('Accesso squadra')
    expect(html).toContain('Nome utente')
    expect(html).toContain('La password viene generata automaticamente dal server.')
    expect(html).toContain('Scarica tutte le credenziali squadre')
    expect(html).toContain('Crea squadra')
    expect(html).not.toContain('Manual password')
    expect(html).not.toContain('Confirm password')
  })

  it('renders /admin/control-room without a round', () => {
    const html = renderScreen(
      <ControlRoomContent
        tournament={createEmptyTournamentDomain('Empty Control Room')}
        porTresPrizeDraft="Prize"
        onPorTresPrizeChange={vi.fn()}
        onActivatePorTres={vi.fn()}
        onRollGlobalDice={vi.fn()}
      />,
    )

    expect(html).toContain('Nessun turno configurato')
    expect(html).toContain('Nessun turno')
  })

  it('renders ControlRoom with a match', () => {
    const html = renderScreen(
      <ControlRoomContent
        tournament={createDemoTournament()}
        porTresPrizeDraft="Prize"
        onPorTresPrizeChange={vi.fn()}
        onActivatePorTres={vi.fn()}
        onRollGlobalDice={vi.fn()}
      />,
    )

    expect(html).toContain('PREPARAZIONE TORNEO')
    expect(html).toContain('PROSSIMA AZIONE')
    expect(html).toContain('ROUND 1')
  })

  it('renders main display as a read-only board', () => {
    const html = renderScreen(
      <MemoryRouter>
        <MainDisplayContent tournament={createDemoTournament()} />
      </MemoryRouter>,
    )

    expect(html).toContain('Maxischermo')
    expect(html).not.toContain('ACTIVATE')
    expect(html).not.toContain('ROLL GLOBAL DICE')
  })

  it('renders empty main display state without crashing', () => {
    const html = renderScreen(
      <MemoryRouter>
        <MainDisplayContent tournament={createEmptyTournamentDomain()} />
      </MemoryRouter>,
    )

    expect(html).toContain('0 campi nel turno')
  })
})
