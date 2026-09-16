// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { useDemoStore } from '../demo/demoStore'
import { emptyTournament, entryFromTournament, useWorkspaceStore } from '../features/admin/workspace/workspaceStore'
import TestDataPanel from './TestDataPanel'
import { TournamentSetupPage } from '../features/admin/setup/TournamentSetupPage'
import { seedSessions } from './supabaseTestSeeder'
const provider = vi.hoisted(() => ({ remote: false }))

vi.mock('../repositories', () => ({ isSupabaseProvider: () => provider.remote }))
vi.mock('../repositories/teamRepository', () => ({ useTeamRepository: () => ({ createTeam: vi.fn() }) }))
vi.mock('../features/tournament/useTournament', () => ({ useTournament: () => ({ data: useDemoStore(state => state.tournament), isLoading: false }) }))
const admin: AuthContextValue = { status: 'authenticated', session: null, profile: { id: 'admin', tournamentId: 'ui-dev', username: 'admin', displayName: 'Admin', role: 'admin' }, signInWithUsername: vi.fn(), reauthenticateForReset: vi.fn(), logout: vi.fn(), refreshProfile: vi.fn() }

beforeEach(() => {
  provider.remote = false
  seedSessions.clear()
  const tournament = emptyTournament('ui-dev', 'UI test tournament')
  const entry = entryFromTournament(tournament)
  entry.config.teamsCount = 12
  useDemoStore.setState({ tournament, events: [], savedWorkspaces: {}, savedEvents: {} })
  useWorkspaceStore.setState({ entries: { [tournament.id]: entry }, selectedId: tournament.id, deletedIds: [] })
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })
function mount(auth = admin) { return render(<AuthContext.Provider value={auth}><TestDataPanel /></AuthContext.Provider>) }
describe('Admin development tools', () => {
  it.each(['team', 'referee', 'court_display', 'main_display'] as const)('hides the panel for %s', role => {
    mount({ ...admin, profile: { ...admin.profile!, role } })
    expect(screen.queryByRole('button', { name: 'GENERATE TEST TEAMS' })).toBeNull()
  })
  it('mounts TEST DATA before SUMMARY inside Tournament Setup outside Vite DEV', async () => {
    vi.stubEnv('DEV', false)
    render(<AuthContext.Provider value={admin}><TournamentSetupPage initialSection="TEST DATA" /></AuthContext.Provider>)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['GENERAL', 'TEAMS', 'CARDS', 'SPECIAL EVENTS', 'TEST DATA', 'SUMMARY'])
    expect(await screen.findByRole('button', { name: 'GENERATE TEST TEAMS' })).toBeTruthy()
  })
  it('keeps the card visible without a selected tournament', async () => {
    useWorkspaceStore.setState({ entries: {}, deletedIds: ['ui-dev'], selectedId: null })
    render(<AuthContext.Provider value={admin}><TournamentSetupPage /></AuthContext.Provider>)
    expect(await screen.findByText('Select or create a tournament first.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'GENERATE TEST TEAMS' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('separates Supabase generation from persistence', async () => {
    provider.remote = true
    vi.stubEnv('DEV', false)
    mount()
    expect(screen.queryByRole('button', { name: 'SEED TEST DATA TO SUPABASE' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'GENERATE TEST TEAMS' }))
    fireEvent.click(screen.getByRole('button', { name: 'GENERATE 12 TEAMS' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useDemoStore.getState().tournament.teams).toHaveLength(0)
    expect(seedSessions.get('ui-dev')).toHaveLength(12)
    expect(seedSessions.get('ui-dev')?.every(row => !row.teamId && row.status === 'pending')).toBe(true)
    expect((screen.getByRole('button', { name: 'SEED TEST DATA TO SUPABASE' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'SEED TEST DATA TO SUPABASE' }))
    expect(screen.getByRole('button', { name: 'CONFIRM SUPABASE SEED' })).toBeTruthy()
  })
  it('requires an authenticated admin but remains visible outside Vite DEV', () => {
    const view = mount({ ...admin, status: 'unauthenticated' })
    expect(screen.queryByText('TESTING TOOL')).toBeNull()
    view.rerender(<AuthContext.Provider value={{ ...admin, profile: { ...admin.profile!, role: 'team' } }}><TestDataPanel /></AuthContext.Provider>)
    expect(screen.queryByText('DEVELOPMENT TOOLS')).toBeNull()
    vi.stubEnv('DEV', false)
    view.rerender(<AuthContext.Provider value={admin}><TestDataPanel /></AuthContext.Provider>)
    expect(screen.queryByText('DEVELOPMENT TOOLS')).toBeNull()
  })
  it('generates only after confirmation, inspects real roster entities and confirms cleanup', async () => {
    mount()
    expect(screen.queryByRole('button', { name: 'SEED TEST DATA TO SUPABASE' })).toBeNull()
    expect(useDemoStore.getState().tournament.teams).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'GENERATE TEST TEAMS' }))
    expect(screen.getByText(/Teams required: 12/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'GENERATE 12 TEAMS' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useDemoStore.getState().tournament.teams).toHaveLength(12)
    expect(screen.getByText('12 test teams / 36 players / 0 login accounts')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: useDemoStore.getState().tournament.teams[0].name }))
    expect(screen.getByText('TEAM TEST INSPECTOR')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'REMOVE TEST TEAMS' }))
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useDemoStore.getState().tournament.teams).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'RESET TOURNAMENT TEST DATA' }))
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM REMOVAL' }))
    await waitFor(() => expect(useDemoStore.getState().tournament.teams).toHaveLength(0))
  })
  it('disables unsupported configured counts', () => {
    const entry = useWorkspaceStore.getState().entries['ui-dev']
    useWorkspaceStore.setState({ entries: { 'ui-dev': { ...entry, config: { ...entry.config, teamsCount: 34 } } } })
    mount()
    expect(screen.getByText('Test dataset supports a maximum of 33 teams.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'GENERATE TEST TEAMS' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
