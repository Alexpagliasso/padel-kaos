// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createDemoTournament } from '../../demo/demoSeed'
import { resolvePlayerRouteState } from '../../routes/playerRouteState'
import { TeamCardDeck, TeamMobileApp } from './TeamMobileApp'

afterEach(cleanup)

function renderApp(configure?: (tournament: ReturnType<typeof createDemoTournament>) => void) {
  const tournament = createDemoTournament()
  configure?.(tournament)
  const routeState = resolvePlayerRouteState({ provider: 'demo', tournament, demoSelectedTeamId: 'team-red' })
  if (routeState.type !== 'ready') throw new Error('Stato Team non pronto')
  render(<QueryClientProvider client={new QueryClient()}><TeamMobileApp tournament={tournament} events={[]} routeState={routeState} onSelectDemoTeam={vi.fn()} onPlayDemoCard={vi.fn()} headerAction={<button>Esci</button>} /></QueryClientProvider>)
  return { tournament, routeState }
}

describe('Team mobile app navigation', () => {
  it('opens Partita by default and keeps three destinations plus the Cards action and logout', () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'Partita' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('navigation', { name: 'Navigazione squadra' }).querySelectorAll('button')).toHaveLength(4)
    expect(Array.from(screen.getByRole('navigation', { name: 'Navigazione squadra' }).querySelectorAll('button')).map(button => button.textContent)).toEqual(['Partita', 'Classifica', 'Risultati', '3Carte'])
    expect(screen.getByRole('button', { name: /Apri carte, \d+ disponibili/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Esci' })).toBeTruthy()
    expect(screen.getAllByText(/team red/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/team blue/i).length).toBeGreaterThan(0)
  })

  it('opens Classifica and Risultati independently using real Team data', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Classifica' }))
    expect(await screen.findByRole('heading', { name: 'Classifica' })).toBeTruthy()
    expect(document.querySelector('[data-current-team="true"]')?.textContent).toMatch(/team red/i)
    fireEvent.click(screen.getByRole('button', { name: 'Risultati' }))
    expect(await screen.findByRole('heading', { name: 'Partite della squadra' })).toBeTruthy()
    expect(screen.getAllByText(/team blue/i).length).toBeGreaterThan(0)
  })

  it('opens Cards as an action and returns to the previously selected destination', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Classifica' }))
    expect(await screen.findByRole('heading', { name: 'Classifica' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Apri carte, \d+ disponibili/ }))
    expect(await screen.findByRole('heading', { name: 'Le tue carte' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Navigazione squadra' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi carte' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Classifica' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('heading', { name: 'Classifica' })).toBeTruthy()
  })

  it('keeps Set 1 and Set 2 visible, shows the opponent confirmation, and hides STB initially', () => {
    const { tournament } = renderApp()
    expect(screen.getByRole('button', { name: /Set 1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Set 2/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Super Tie-Break/i })).toBeNull()
    expect(screen.getByText('Formazione avversaria')).toBeTruthy()
    const opponent = tournament.teams.find(team => team.id === 'team-blue')!
    expect(screen.getByText(opponent.players[0].name)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Set 2/i }))
    expect(screen.getByRole('button', { name: 'Conferma Set 2' })).toBeTruthy()
    expect(screen.getByText('Formazione avversaria non ancora disponibile')).toBeTruthy()
  })

  it('makes a started set read-only and reveals STB only when the match requires it', () => {
    const { tournament } = renderApp(tournament => {
      const match = tournament.matches[0]
      match.set1StartedAt = '2026-09-17T10:00:00Z'
      match.score.currentSet = 3
      match.lineups.push(
        { teamId: 'team-red', setNumber: 2, activePlayerIds: ['team-red-p1', 'team-red-p3'], benchPlayerId: 'team-red-p2' },
        { teamId: 'team-red', setNumber: 3, activePlayerIds: ['team-red-p2', 'team-red-p3'], benchPlayerId: 'team-red-p1' },
      )
    })
    expect(screen.queryByRole('button', { name: 'Modifica' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Super Tie-Break/i }))
    const ownTeam = tournament.teams.find(team => team.id === 'team-red')!
    expect(screen.getAllByText(ownTeam.players[1].name).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Conferma Set 3' })).toBeNull()
  })

  it('selects only Team matches, preserves selection across tabs, and scopes Cards to it', async () => {
    const { tournament } = renderApp(value => {
      value.matches.push({ ...value.matches[0], id: 'match-red-2', teamBId: 'team-yellow', courtId: 'court-2', status: 'scheduled', lineups: [], score: { ...value.matches[0].score, currentSet: 1 } })
      value.teamCards.push({ id: 'tc-red-second', teamId: 'team-red', cardId: 'card-power-point', matchId: 'match-red-2', state: 'available' })
    })
    const selector = screen.getByRole('combobox', { name: 'Seleziona partita' }) as HTMLSelectElement
    expect(selector.querySelectorAll('option')).toHaveLength(2)
    expect(Array.from(selector.options).every(option => !option.textContent?.includes('TEAM BLACK'))).toBe(true)
    fireEvent.change(selector, { target: { value: 'match-red-2' } })
    expect(screen.getAllByText('TEAM YELLOW').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Apri carte, 1 disponibili' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Classifica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Partita' }))
    expect((await screen.findByRole('combobox', { name: 'Seleziona partita' }) as HTMLSelectElement).value).toBe('match-red-2')
    expect(tournament.matches.find(match => match.id === 'match-red-2')).toBeTruthy()
  })

  it('opens the exact match selected from Risultati', async () => {
    renderApp(value => value.matches.push({ ...value.matches[0], id: 'match-red-2', teamBId: 'team-yellow', courtId: 'court-2', status: 'completed', lineups: [], score: { ...value.matches[0].score, currentSet: 2 } }))
    fireEvent.click(screen.getByRole('button', { name: 'Risultati' }))
    fireEvent.click(await screen.findByRole('button', { name: /Apri partita contro TEAM YELLOW, Terminata/i }))
    expect((await screen.findByRole('button', { name: 'Partita' })).getAttribute('aria-current')).toBe('page')
    expect((await screen.findByRole('combobox', { name: 'Seleziona partita' }) as HTMLSelectElement).value).toBe('match-red-2')
    expect(screen.getAllByText('TEAM YELLOW').length).toBeGreaterThan(0)
  })

  it('expands historical lineups for both teams without selecting the match', async () => {
    renderApp(value => value.matches.push({
      ...value.matches[0], id: 'match-history', status: 'completed', score: { ...value.matches[0].score, currentSet: 2 },
      lineups: [
        { teamId: 'team-red', setNumber: 1, activePlayerIds: ['team-red-p1', 'team-red-p2'], benchPlayerId: 'team-red-p3' },
        { teamId: 'team-blue', setNumber: 1, activePlayerIds: ['team-blue-p1', 'team-blue-p3'], benchPlayerId: 'team-blue-p2' },
        { teamId: 'team-red', setNumber: 2, activePlayerIds: ['team-red-p1', 'team-red-p3'], benchPlayerId: 'team-red-p2' },
      ],
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Risultati' }))
    const expanders = await screen.findAllByRole('button', { name: 'Vedi formazioni' })
    fireEvent.click(expanders[expanders.length - 1])
    expect(screen.getByRole('button', { name: 'Risultati' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('combobox', { name: 'Seleziona partita' })).toBeNull()
    expect(screen.getAllByText('La tua formazione').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Formazione avversaria').length).toBeGreaterThan(0)
    expect(screen.getByText('Formazione avversaria non disponibile')).toBeTruthy()
    expect(screen.queryByText('Super Tie-Break')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modifica' })).toBeNull()
  })

  it('shows historical STB lineups only when the match actually required them', async () => {
    renderApp(value => value.matches.push({
      ...value.matches[0], id: 'match-stb', status: 'completed', score: { ...value.matches[0].score, currentSet: 3 },
      lineups: [
        ...value.matches[0].lineups,
        { teamId: 'team-red', setNumber: 3, activePlayerIds: ['team-red-p2', 'team-red-p3'], benchPlayerId: 'team-red-p1' },
        { teamId: 'team-blue', setNumber: 3, activePlayerIds: ['team-blue-p2', 'team-blue-p3'], benchPlayerId: 'team-blue-p1' },
      ],
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Risultati' }))
    const expanders = await screen.findAllByRole('button', { name: 'Vedi formazioni' })
    fireEvent.click(expanders[expanders.length - 1])
    expect(screen.getByRole('region', { name: 'Super Tie-Break' })).toBeTruthy()
  })
})

describe('interactive Team card deck', () => {
  it.each([1, 2, 3])('handles %i cards and alternative navigation', count => {
    const tournament = createDemoTournament()
    const cards = tournament.teamCards.filter(card => card.teamId === 'team-red').slice(0, count)
    render(<TeamCardDeck open onClose={vi.fn()} cards={cards} definitions={tournament.cards} demo={false} onPlayDemoCard={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Le tue carte' })).toBeTruthy()
    expect(document.querySelector('[data-card-experience="fullscreen"]')).toBeTruthy()
    if (count > 1) expect(screen.getByLabelText(`Carta 1 di ${count}`)).toBeTruthy()
    if (count > 1) { fireEvent.click(screen.getByRole('button', { name: 'Carta successiva' })); expect(screen.getByLabelText(`Carta 2 di ${count}`)).toBeTruthy() }
    expect(screen.getAllByRole('button', { name: 'Utilizza' })[0].hasAttribute('disabled')).toBe(true)
  })

  it('opens details inside the fullscreen experience and returns to the same card', () => {
    const tournament = createDemoTournament()
    const play = vi.fn()
    const card = tournament.teamCards.find(item => item.teamId === 'team-red')!
    const definition = tournament.cards.find(item => item.id === card.cardId)!
    render(<TeamCardDeck open onClose={vi.fn()} cards={[card]} definitions={tournament.cards} demo={false} onPlayDemoCard={play} />)
    fireEvent.click(screen.getByRole('button', { name: `Dettagli carta ${definition.name}` }))
    expect(screen.getByText(definition.longDescription || definition.description)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Torna alla mano' }))
    expect(screen.getByRole('button', { name: `Dettagli carta ${definition.name}` })).toBeTruthy()
    expect(play).not.toHaveBeenCalled()
  })

  it('renders an intentional empty fullscreen state', () => {
    const tournament = createDemoTournament()
    render(<TeamCardDeck open onClose={vi.fn()} cards={[]} definitions={tournament.cards} demo={false} onPlayDemoCard={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Nessuna carta disponibile' })).toBeTruthy()
    expect(screen.getByText('Non ci sono carte assegnate a questa partita.')).toBeTruthy()
  })

  it('makes the neighboring card a primary tappable selector', () => {
    const tournament = createDemoTournament()
    const cards = tournament.teamCards.filter(card => card.teamId === 'team-red').slice(0, 3)
    const nextDefinition = tournament.cards.find(item => item.id === cards[1].cardId)!
    render(<TeamCardDeck open onClose={vi.fn()} cards={cards} definitions={tournament.cards} demo={false} onPlayDemoCard={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: `Seleziona carta ${nextDefinition.name}` }))
    expect(screen.getByRole('button', { name: `Dettagli carta ${nextDefinition.name}` })).toBeTruthy()
    expect(screen.getByLabelText(`Carta 2 di ${cards.length}`)).toBeTruthy()
  })

  it('preserves the active neighboring card after visiting details', () => {
    const tournament = createDemoTournament()
    const cards = tournament.teamCards.filter(card => card.teamId === 'team-red').slice(0, 3)
    const nextDefinition = tournament.cards.find(item => item.id === cards[1].cardId)!
    render(<TeamCardDeck open onClose={vi.fn()} cards={cards} definitions={tournament.cards} demo={false} onPlayDemoCard={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: `Seleziona carta ${nextDefinition.name}` }))
    fireEvent.click(screen.getByRole('button', { name: `Dettagli carta ${nextDefinition.name}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Torna alla mano' }))
    expect(screen.getByRole('button', { name: `Dettagli carta ${nextDefinition.name}` })).toBeTruthy()
    expect(screen.getByLabelText(`Carta 2 di ${cards.length}`)).toBeTruthy()
  })

  it('keeps the Utilizza copy stable across enabled and disabled card states', () => {
    const tournament = createDemoTournament()
    const card = tournament.teamCards.find(item => item.teamId === 'team-red')!
    const play = vi.fn()
    const { rerender } = render(<TeamCardDeck open onClose={vi.fn()} cards={[card]} definitions={tournament.cards} demo onPlayDemoCard={play} />)
    const enabled = screen.getByRole('button', { name: 'Utilizza' })
    expect(enabled.hasAttribute('disabled')).toBe(false)
    fireEvent.click(enabled)
    expect(play).toHaveBeenCalledWith(card.id)
    rerender(<TeamCardDeck open onClose={vi.fn()} cards={[{ ...card, state: 'used' }]} definitions={tournament.cards} demo onPlayDemoCard={play} />)
    expect(screen.getByRole('button', { name: 'Utilizza' }).hasAttribute('disabled')).toBe(true)
  })
})
