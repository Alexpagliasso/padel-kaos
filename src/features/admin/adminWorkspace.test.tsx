// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createDemoTournament } from '../../demo/demoSeed'
import { TournamentThemeProvider } from '../../theme/ThemeProvider'
import { TournamentSelector } from './workspace/TournamentSelector'
import { TournamentSetupPage } from './setup/TournamentSetupPage'
import { LibraryPanel } from './setup/LibraryPanel'
import { ControlRoomContent } from './control-room/ControlRoom'
import { MatchReportSubmission } from './reports/MatchReportSubmission'
import { entryFromTournament, useWorkspaceStore } from './workspace/workspaceStore'

vi.mock('../tournament/useTournament', () => ({ useTournament: () => ({ data: createDemoTournament() }) }))
beforeEach(() => useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true))
afterEach(cleanup)
function mount(children: React.ReactNode) {
  return render(<TournamentThemeProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider></TournamentThemeProvider>)
}
function LocalLibrary({ id, kind }: { id: string; kind: 'cards' | 'events' }) {
  const entry = useWorkspaceStore(state => state.entries[id])
  return <LibraryPanel entry={entry} kind={kind} />
}
describe('tournament setup interactions', async () => {
  it('creates a tournament and requires one available court per group before saving', async () => {
    mount(<><TournamentSelector /><TournamentSetupPage /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo torneo' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Nome torneo', { exact: false }), { target: { value: 'Sunset Open' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Crea torneo' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const id = useWorkspaceStore.getState().selectedId!
    expect(useWorkspaceStore.getState().entries[id].config.name).toBe('Sunset Open')
    fireEvent.change(screen.getByRole('spinbutton', { name: /Numero di squadre/ }), { target: { value: 12 } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Campi disponibili/ }), { target: { value: 1 } })
    expect(screen.getByText(/Il numero di campi deve corrispondere al numero di gironi \(3\)/)).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton', { name: /Campi disponibili/ }), { target: { value: 3 } })
    expect(screen.getByText(/Consigliati: 3 campi/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salva configurazione' }))
    expect(useWorkspaceStore.getState().entries[id].config.courtsCount).toBe(3)
    expect(screen.getByText('Configurazione salvata per questa sessione.')).toBeTruthy()
  })
  it('selects an existing tournament without mixing configurations', async () => {
    const state = useWorkspaceStore.getState()
    state.createTournament('First tournament')
    state.createTournament('Second tournament')
    mount(<><TournamentSelector /><TournamentSetupPage /></>)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Torneo' }))
    fireEvent.click(await screen.findByRole('option', { name: /First tournament/ }))
    expect((screen.getByRole('textbox', { name: /Nome torneo/ }) as HTMLInputElement).value).toBe('First tournament')
  })
  it('recalculates the selected tournament own structure immediately and keeps A/B configurations independent', async () => {
    const store = useWorkspaceStore.getState()
    const a = store.createTournament('Tournament A')
    const b = store.createTournament('Tournament B')
    const entryA = useWorkspaceStore.getState().entries[a]
    const entryB = useWorkspaceStore.getState().entries[b]
    store.saveConfig(entryA, { ...entryA.config, teamsCount: 30, teamsPerGroup: 5, goldQualifiedCount: 12, silverQualifiedCount: 12, courtsCount: 6, allowByes: true })
    store.saveConfig(entryB, { ...entryB.config, teamsCount: 12, teamsPerGroup: 4, goldQualifiedCount: 4, silverQualifiedCount: 4, courtsCount: 3, allowByes: false })
    const savedB = useWorkspaceStore.getState().entries[b].config
    store.select(a)
    mount(<><TournamentSelector /><TournamentSetupPage /></>)
    expect(screen.getByText('82 partite totali del torneo')).toBeTruthy()
    expect(screen.getByText('30 squadre / 6 gironi')).toBeTruthy()
    const switchTo = async (name: string) => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Torneo' }))
      fireEvent.click(await screen.findByRole('option', { name: new RegExp(name) }))
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    }
    await switchTo('Tournament B')
    expect(await screen.findByText('24 partite totali del torneo')).toBeTruthy()
    expect((screen.getByRole('spinbutton', { name: 'Squadre per girone' }) as HTMLInputElement).value).toBe('4')
    expect(screen.getByText('12 squadre / 3 gironi')).toBeTruthy()
    await switchTo('Tournament A')
    expect(screen.getByText('82 partite totali del torneo')).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Numero di squadre' }), { target: { value: 25 } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Campi disponibili' }), { target: { value: 5 } })
    expect(screen.getByText('72 partite totali del torneo')).toBeTruthy()
    expect(screen.getByText('25 squadre / 5 gironi')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salva configurazione' }))
    expect(useWorkspaceStore.getState().entries[b].config).toBe(savedB)
    await switchTo('Tournament B')
    expect(screen.getByText('24 partite totali del torneo')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'RIEPILOGO' }))
    expect(screen.getByText('24 partite totali del torneo')).toBeTruthy()
    await switchTo('Tournament A')
    expect(screen.getByText('72 partite totali del torneo')).toBeTruthy()
    expect(useWorkspaceStore.getState().entries[a].config.allowByes).toBe(true)
    expect(useWorkspaceStore.getState().entries[b].config.allowByes).toBe(false)
  })
  it('confirms start, locks fields, completes, and requires typed deletion confirmation', async () => {
    const id = useWorkspaceStore.getState().createTournament('Night Cup')
    mount(<TournamentSetupPage />)
    fireEvent.click(screen.getByRole('tab', { name: 'RIEPILOGO' }))
    fireEvent.click(screen.getByRole('button', { name: 'AVVIA TORNEO' }))
    expect(useWorkspaceStore.getState().entries[id].config.status).toBe('draft')
    fireEvent.click(screen.getByRole('button', { name: 'Conferma Avvia torneo' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useWorkspaceStore.getState().entries[id].config.status).toBe('live')
    fireEvent.click(screen.getByRole('tab', { name: 'GENERALE' }))
    expect((screen.getByRole('spinbutton', { name: /Campi disponibili/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('textbox', { name: /Nome torneo/ }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'RIEPILOGO' }))
    fireEvent.click(screen.getByRole('button', { name: 'COMPLETA TORNEO' }))
    fireEvent.click(screen.getByRole('button', { name: 'Conferma Completa torneo' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useWorkspaceStore.getState().entries[id].config.status).toBe('completed')
    expect(screen.queryByRole('button', { name: 'ELIMINA TORNEO' })).toBeNull()
    expect(useWorkspaceStore.getState().entries[id]).toBeTruthy()
  })
  it('creates a card with an image and toggles activation without deleting it', async () => {
    const id = useWorkspaceStore.getState().createTournament('Card Cup')
    mount(<LocalLibrary id={id} kind="cards" />)
    fireEvent.click(screen.getByRole('button', { name: 'Nuova carta' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Golden volley' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrizione breve' }), { target: { value: 'A new card definition.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrizione lunga' }), { target: { value: 'A detailed card effect.' } })
    fireEvent.change(screen.getByLabelText('Carica immagine'), { target: { files: [new File(['image'], 'card.png', { type: 'image/png' })] } })
    await screen.findByRole('img', { name: 'Anteprima carta' })
    fireEvent.click(screen.getByRole('button', { name: 'Crea carta' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const toggle = screen.getByLabelText('Attiva in questo torneo: Golden volley')
    fireEvent.click(toggle)
    const card = useWorkspaceStore.getState().cards.find(item => item.title === 'Golden volley')!
    expect(useWorkspaceStore.getState().entries[id].activeCards).toContain(card.id)
    fireEvent.click(toggle)
    expect(useWorkspaceStore.getState().entries[id].activeCards).not.toContain(card.id)
    expect(screen.getByRole('heading', { name: 'Golden volley' })).toBeTruthy()
  })
  it('creates a special event and toggles its tournament activation', async () => {
    const id = useWorkspaceStore.getState().createTournament('Event Cup')
    mount(<LocalLibrary id={id} kind="events" />)
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo evento' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Nome evento/ }), { target: { value: 'Golden smash' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrizione' }), { target: { value: 'Special prize challenge.' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Premio/ }), { target: { value: 'New racket' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crea evento' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const toggle = screen.getByLabelText('Attiva in questo torneo: Golden smash')
    fireEvent.click(toggle)
    const event = useWorkspaceStore.getState().events.find(item => item.name === 'Golden smash')!
    expect(useWorkspaceStore.getState().entries[id].activeEvents).toContain(event.id)
    fireEvent.click(toggle)
    expect(useWorkspaceStore.getState().entries[id].activeEvents).not.toContain(event.id)
    expect(screen.getByRole('heading', { name: 'Golden smash' })).toBeTruthy()
  })
  it('exposes the tournament Dice Library editor', () => {
    useWorkspaceStore.getState().createTournament('Dice Cup')
    mount(<TournamentSetupPage initialSection="DICE" />)
    expect(screen.getByRole('heading', { name: 'Libreria Dado' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'NUOVO EFFETTO' })).toBeTruthy()
    expect(screen.getByText(/può contenere più di sei effetti/)).toBeTruthy()
  })
})
describe('event operations and final reports', async () => {
  it('shows the current Regia operation gates without mutating demo dice state', async () => {
    const t = createDemoTournament()
    const entry = entryFromTournament(t)
    useWorkspaceStore.getState().transition(entry, 'start')
    mount(<ControlRoomContent tournament={t} />)
    expect(screen.queryByText(/\+ Point|\+ Game/)).toBeNull()
    expect((screen.getByRole('button', { name: 'LANCIA DADO GLOBALE' }) as HTMLButtonElement).disabled).toBe(true)
    expect(useWorkspaceStore.getState().entries[t.id].dice).toBeUndefined()
  })

  it('organizes Regia into preparation and live modes', () => {
    const t = createDemoTournament()
    mount(<ControlRoomContent tournament={t} />)
    expect(screen.getByRole('tab', { name: 'PREPARAZIONE' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'LIVE' })).toBeTruthy()
    expect(screen.getByText('PROSSIMA AZIONE')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'DADO DEL TURNO' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'JOLLY' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'EVENTI SPECIALI' })).toBeTruthy()
    expect(screen.getByText('CONTROLLO PRE-AVVIO')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'AVVIA TURNO' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'LIVE' }))
    expect(screen.getByText('TORNEO LIVE')).toBeTruthy()
  })

  it('locks dice and Jolly configuration after the turn starts', () => {
    const t = createDemoTournament()
    if (t.rounds?.[0]) t.rounds[0].openedAt = '2026-09-28T10:00:00.000Z'
    t.matches[0].status = 'live_set_1'
    mount(<ControlRoomContent tournament={t} />)
    fireEvent.click(screen.getByRole('tab', { name: 'PREPARAZIONE' }))
    expect(screen.getByText('CONFIGURAZIONE BLOCCATA — TURNO IN CORSO')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'SALVA SELEZIONE DADO' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'SALVA CARTE COPIABILI' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('offers Regia only tournament-enabled dice effects as a compact turn selection', () => {
    const t = createDemoTournament()
    t.diceRules[2].enabled = false
    mount(<ControlRoomContent tournament={t} />)
    expect(screen.getByText('5 / 6 FACCE SELEZIONATE')).toBeTruthy()
    expect(screen.getByText('SERVONO ALMENO 6 EFFETTI DADO ATTIVI')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /PALLINE SGONFIE/ })).toBeNull()
    expect(screen.getByRole('button', { name: /ONE VS ONE ✓/ })).toBeTruthy()
  })
  it('submits a final referee report with the entered set scores', async () => {
    const t = createDemoTournament()
    t.matches[0].status = 'completed'
    const view = mount(<MatchReportSubmission tournament={t} match={t.matches[0]} referee="Referee Ada" />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit final match report' }))
    for (const [name, value] of [['Set 1 A', 6], ['Set 1 B', 4], ['Set 2 A', 6], ['Set 2 B', 3]] as const) fireEvent.change(screen.getByRole('spinbutton', { name }), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Invia report partita' }))
    expect(useWorkspaceStore.getState().reports[0].result).toBe('2 - 0')
    expect(useWorkspaceStore.getState().reports[0].referee).toBe('Referee Ada')
    view.unmount()
  })
})
