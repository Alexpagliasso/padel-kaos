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
  it('creates a tournament, saves editable general fields and keeps court count advisory', async () => {
    mount(<><TournamentSelector /><TournamentSetupPage /></>)
    fireEvent.click(screen.getByRole('button', { name: 'New tournament' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Tournament name', { exact: false }), { target: { value: 'Sunset Open' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create tournament' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const id = useWorkspaceStore.getState().selectedId!
    expect(useWorkspaceStore.getState().entries[id].config.name).toBe('Sunset Open')
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of teams/ }), { target: { value: 12 } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Available courts/ }), { target: { value: 1 } })
    expect(screen.getByText(/Recommended: 3 courts/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
    expect(useWorkspaceStore.getState().entries[id].config.courtsCount).toBe(1)
    expect(screen.getByText('Configuration saved for this session.')).toBeTruthy()
  })
  it('selects an existing tournament without mixing configurations', async () => {
    const state = useWorkspaceStore.getState()
    state.createTournament('First tournament')
    state.createTournament('Second tournament')
    mount(<><TournamentSelector /><TournamentSetupPage /></>)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tournament' }))
    fireEvent.click(await screen.findByRole('option', { name: 'First tournament / draft' }))
    expect((screen.getByRole('textbox', { name: /Tournament name/ }) as HTMLInputElement).value).toBe('First tournament')
  })
  it('recalculates the selected tournament own structure immediately and keeps A/B configurations independent', async () => {
    const store = useWorkspaceStore.getState()
    const a = store.createTournament('Tournament A')
    const b = store.createTournament('Tournament B')
    const entryA = useWorkspaceStore.getState().entries[a]
    const entryB = useWorkspaceStore.getState().entries[b]
    store.saveConfig(entryA, { ...entryA.config, teamsCount: 30, teamsPerGroup: 5, goldQualifiedCount: 12, silverQualifiedCount: 12, courtsCount: 6, allowByes: true })
    store.saveConfig(entryB, { ...entryB.config, teamsCount: 12, teamsPerGroup: 4, goldQualifiedCount: 4, silverQualifiedCount: 4, courtsCount: 2, allowByes: false })
    const savedB = useWorkspaceStore.getState().entries[b].config
    store.select(a)
    mount(<><TournamentSelector /><TournamentSetupPage /></>)
    expect(screen.getByText('82 total tournament matches')).toBeTruthy()
    expect(screen.getByText('30 teams / 6 groups')).toBeTruthy()
    const switchTo = async (name: string) => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tournament' }))
      fireEvent.click(await screen.findByRole('option', { name: `${name} / draft` }))
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    }
    await switchTo('Tournament B')
    expect(screen.getByText('24 total tournament matches')).toBeTruthy()
    expect((screen.getByRole('spinbutton', { name: 'Teams per group' }) as HTMLInputElement).value).toBe('4')
    expect(screen.getByText('12 teams / 3 groups')).toBeTruthy()
    await switchTo('Tournament A')
    expect(screen.getByText('82 total tournament matches')).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Number of teams' }), { target: { value: 25 } })
    expect(screen.getByText('72 total tournament matches')).toBeTruthy()
    expect(screen.getByText('25 teams / 5 groups')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
    expect(useWorkspaceStore.getState().entries[b].config).toBe(savedB)
    await switchTo('Tournament B')
    expect(screen.getByText('24 total tournament matches')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'SUMMARY' }))
    expect(screen.getByText('24 total tournament matches')).toBeTruthy()
    await switchTo('Tournament A')
    expect(screen.getByText('72 total tournament matches')).toBeTruthy()
    expect(useWorkspaceStore.getState().entries[a].config.allowByes).toBe(true)
    expect(useWorkspaceStore.getState().entries[b].config.allowByes).toBe(false)
  })
  it('confirms start, locks fields, completes, and requires typed deletion confirmation', async () => {
    const id = useWorkspaceStore.getState().createTournament('Night Cup')
    mount(<TournamentSetupPage />)
    fireEvent.click(screen.getByRole('tab', { name: 'SUMMARY' }))
    fireEvent.click(screen.getByRole('button', { name: 'START TOURNAMENT' }))
    expect(useWorkspaceStore.getState().entries[id].config.status).toBe('draft')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Start Tournament' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useWorkspaceStore.getState().entries[id].config.status).toBe('live')
    fireEvent.click(screen.getByRole('tab', { name: 'GENERAL' }))
    expect((screen.getByRole('spinbutton', { name: /Available courts/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('textbox', { name: /Tournament name/ }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'SUMMARY' }))
    fireEvent.click(screen.getByRole('button', { name: 'COMPLETE TOURNAMENT' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Complete Tournament' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useWorkspaceStore.getState().entries[id].config.status).toBe('completed')
    fireEvent.click(screen.getByRole('button', { name: 'DELETE TOURNAMENT' }))
    expect((screen.getByRole('button', { name: 'Confirm Delete Tournament' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Type DELETE Night Cup'), { target: { value: 'DELETE Night Cup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete Tournament' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useWorkspaceStore.getState().entries[id]).toBeUndefined()
  })
  it('creates a card with an image and toggles activation without deleting it', async () => {
    const id = useWorkspaceStore.getState().createTournament('Card Cup')
    mount(<LocalLibrary id={id} kind="cards" />)
    fireEvent.click(screen.getByRole('button', { name: 'New card' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Card title/ }), { target: { value: 'Golden volley' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Description/ }), { target: { value: 'A new card definition.' } })
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['image'], 'card.png', { type: 'image/png' })] } })
    await screen.findByRole('img', { name: 'Image preview' })
    fireEvent.click(screen.getByRole('button', { name: 'Create card' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const toggle = screen.getByLabelText('Active in this tournament: Golden volley')
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
    fireEvent.click(screen.getByRole('button', { name: 'New event' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Event name/ }), { target: { value: 'Golden smash' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Description/ }), { target: { value: 'Special prize challenge.' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Reward/ }), { target: { value: 'New racket' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const toggle = screen.getByLabelText('Active in this tournament: Golden smash')
    fireEvent.click(toggle)
    const event = useWorkspaceStore.getState().events.find(item => item.name === 'Golden smash')!
    expect(useWorkspaceStore.getState().entries[id].activeEvents).toContain(event.id)
    fireEvent.click(toggle)
    expect(useWorkspaceStore.getState().entries[id].activeEvents).not.toContain(event.id)
    expect(screen.getByRole('heading', { name: 'Golden smash' })).toBeTruthy()
  })
})
describe('event operations and final reports', async () => {
  it('rolls dice after confirmation and launches/ends an active event', async () => {
    const t = createDemoTournament()
    const entry = entryFromTournament(t)
    useWorkspaceStore.getState().transition(entry, 'start')
    mount(<ControlRoomContent tournament={t} />)
    expect(screen.queryByText(/\+ Point|\+ Game/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'ROLL GLOBAL DICE' }))
    expect(useWorkspaceStore.getState().entries[t.id].dice).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm roll' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(/Current global dice: [1-6]/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'LAUNCH EVENT' }))
    expect(screen.getByText('ACTIVE EVENT')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'END EVENT' }))
    expect(screen.getByText('Event ended / Por Tres')).toBeTruthy()
  })
  it('submits a final report from referee UI, then reviews and approves it in Control Room', async () => {
    const t = createDemoTournament()
    t.matches[0].status = 'completed'
    const view = mount(<MatchReportSubmission tournament={t} match={t.matches[0]} referee="Referee Ada" />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit final match report' }))
    for (const [name, value] of [['Set 1 A', 6], ['Set 1 B', 4], ['Set 2 A', 6], ['Set 2 B', 3]] as const) fireEvent.change(screen.getByRole('spinbutton', { name }), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Send match report' }))
    expect(useWorkspaceStore.getState().reports[0].result).toBe('2 - 0')
    view.unmount()
    mount(<ControlRoomContent tournament={t} />)
    expect(screen.getByText('Match Report')).toBeTruthy()
    expect(screen.getByText('Referee Ada')).toBeTruthy()
    expect(screen.getByText('LINEUPS')).toBeTruthy()
    expect(screen.queryByText('GAME')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'FLAG FOR REVIEW' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value: 'Check lineup' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Flag for review' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(useWorkspaceStore.getState().reports[0].status).toBe('review'))
    fireEvent.click(screen.getByRole('button', { name: 'APPROVE RESULT' }))
    expect(useWorkspaceStore.getState().reports[0].status).toBe('approved')
  })
})
