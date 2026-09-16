// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createDemoTournament } from '../../demo/demoSeed'
import { resolvePlayerRouteState } from '../../routes/playerRouteState'
import { TeamCardDeck, TeamMobileApp } from './TeamMobileApp'

afterEach(cleanup)

function renderApp() {
  const tournament = createDemoTournament()
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
    expect(await screen.findByRole('heading', { name: 'Mazzo carte' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi mazzo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Classifica' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('heading', { name: 'Classifica' })).toBeTruthy()
  })
})

describe('interactive Team card deck', () => {
  it.each([1, 2, 3])('handles %i cards and alternative navigation', count => {
    const tournament = createDemoTournament()
    const cards = tournament.teamCards.filter(card => card.teamId === 'team-red').slice(0, count)
    render(<TeamCardDeck open onClose={vi.fn()} cards={cards} definitions={tournament.cards} demo={false} onPlayDemoCard={vi.fn()} />)
    expect(screen.getByLabelText(`Carta 1 di ${count}`)).toBeTruthy()
    if (count > 1) { fireEvent.click(screen.getByRole('button', { name: 'Carta successiva' })); expect(screen.getByLabelText(`Carta 2 di ${count}`)).toBeTruthy() }
    expect(screen.getAllByRole('button', { name: 'Utilizzo non ancora disponibile' })[0].hasAttribute('disabled')).toBe(true)
  })

  it('opens and closes the long description without playing a card', () => {
    const tournament = createDemoTournament()
    const play = vi.fn()
    const card = tournament.teamCards.find(item => item.teamId === 'team-red')!
    const definition = tournament.cards.find(item => item.id === card.cardId)!
    render(<TeamCardDeck open onClose={vi.fn()} cards={[card]} definitions={tournament.cards} demo={false} onPlayDemoCard={play} />)
    fireEvent.click(screen.getByRole('button', { name: `Dettagli carta ${definition.name}` }))
    expect(screen.getAllByText(definition.longDescription || definition.description).length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi dettagli carta' }))
    expect(play).not.toHaveBeenCalled()
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
})
