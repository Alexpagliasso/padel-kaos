import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../../demo/demoSeed'
import { entryFromTournament, useWorkspaceStore, validateConfig } from './workspaceStore'
import { buildMatchReport, validateReportSets } from '../reports/matchReport'

beforeEach(() => useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true))
describe('local tournament workspace', () => {
  it('creates and selects separate tournaments; editing cannot leak to another tournament', () => {
    const store = useWorkspaceStore.getState()
    const first = store.createTournament('First')
    const second = store.createTournament('Second')
    expect(useWorkspaceStore.getState().selectedId).toBe(second)
    const entry = useWorkspaceStore.getState().entries[first]
    expect(store.saveConfig(entry, { ...entry.config, name: 'Updated', courtsCount: 2 })).toEqual([])
    expect(useWorkspaceStore.getState().entries[second].config.name).toBe('Second')
    store.select(first)
    expect(useWorkspaceStore.getState().selectedId).toBe(first)
  })
  it('requires one court per group and validates numeric fields', () => {
    const t = createDemoTournament()
    const entry = entryFromTournament(t)
    expect(validateConfig({ ...entry.config, courtsCount: 6 })).not.toEqual([])
    expect(validateConfig({ ...entry.config, goldQualifiedCount: 100 })).not.toEqual([])
    expect(validateConfig({ ...entry.config, courtsCount: NaN })).not.toEqual([])
  })
  it('enforces lifecycle, structural lock and strong deletion confirmation in the state layer', () => {
    const store = useWorkspaceStore.getState()
    const id = store.createTournament('Sunset Cup')
    const entry = useWorkspaceStore.getState().entries[id]
    expect(store.transition(entry, 'delete', 'DELETE Sunset Cup')).toBe(false)
    expect(store.transition(entry, 'ready')).toBe(true)
    expect(useWorkspaceStore.getState().entries[id].config.status).toBe('ready')
    expect(store.transition(entry, 'delete', 'Wrong name')).toBe(false)
    expect(store.transition(entry, 'start')).toBe(true)
    expect(store.saveConfig(entry, { ...entry.config, courtsCount: 12 })).toEqual(['Structural setup is locked after start.'])
    expect(store.transition(entry, 'start')).toBe(false)
    expect(store.transition(entry, 'complete')).toBe(true)
    expect(store.saveConfig(entry, entry.config)).not.toEqual([])
    expect(store.transition(entry, 'delete', 'Sunset Cup')).toBe(false)
    const nextId = store.createTournament('Next Cup')
    const nextEntry = useWorkspaceStore.getState().entries[nextId]
    expect(store.transition(nextEntry, 'delete', 'Next Cup')).toBe(true)
    expect(useWorkspaceStore.getState().entries[id]).toBeDefined()
    expect(useWorkspaceStore.getState().cards.length).toBeGreaterThan(0)
  })
  it('keeps library definitions when a tournament deactivates or is deleted', () => {
    const store = useWorkspaceStore.getState()
    const first = store.createTournament('First')
    const second = store.createTournament('Second')
    const entry = useWorkspaceStore.getState().entries[first]
    const card = store.addCard({ title: 'Card', description: 'Description', imageUrl: 'data:image/png;base64,AA==' })
    const event = store.addEvent({ name: 'Event', description: 'Description' })
    store.toggle(entry, 'cards', card, true)
    store.toggle(entry, 'events', event, true)
    expect(useWorkspaceStore.getState().entries[second].activeCards).not.toContain(card)
    store.toggle(entry, 'cards', card, false)
    store.toggle(entry, 'events', event, false)
    expect(useWorkspaceStore.getState().cards.some(item => item.id === card)).toBe(true)
    expect(useWorkspaceStore.getState().events.some(item => item.id === event)).toBe(true)
  })
  it('supports the existing three-player roster contract for a local tournament and locks it after start', () => {
    const store = useWorkspaceStore.getState()
    const id = store.createTournament('Roster Cup')
    const entry = useWorkspaceStore.getState().entries[id]
    const input = { name: 'Volley Team', color: '#ff9955', players: [
      { firstName: 'Ada', lastName: 'One', gender: 'female' as const },
      { firstName: 'Alex', lastName: 'Two', gender: 'male' as const },
      { firstName: 'Sam', lastName: 'Three', gender: 'male' as const },
    ] }
    const teamId = store.saveTeam(entry, input)
    const playerIds = useWorkspaceStore.getState().entries[id].domain.teams[0].players.map(player => player.id)
    store.saveTeam(entry, { ...input, name: 'Updated Volley' }, teamId)
    const team = useWorkspaceStore.getState().entries[id].domain.teams[0]
    expect(team.name).toBe('Updated Volley')
    expect(team.players.map(player => player.id)).toEqual(playerIds)
    expect(team.players[0].gender).toBe('woman')
    store.transition(entry, 'start')
    expect(() => store.saveTeam(entry, input)).toThrow('Roster is read-only.')
  })
  it('dice and event operations are scoped, with inactive events excluded', () => {
    const store = useWorkspaceStore.getState()
    const id = store.createTournament('Live')
    const entry = useWorkspaceStore.getState().entries[id]
    store.rollDice(entry, 'round-1')
    expect(useWorkspaceStore.getState().entries[id].dice).toBeUndefined()
    store.transition(entry, 'start'); store.rollDice(entry, 'round-1')
    expect(useWorkspaceStore.getState().entries[id].dice?.value).toBeGreaterThanOrEqual(1)
    expect(useWorkspaceStore.getState().entries[id].dice?.value).toBeLessThanOrEqual(6)
    const disabled = store.addEvent({ name: 'Disabled', description: 'Not active' })
    store.launchEvent(entry, disabled)
    expect(useWorkspaceStore.getState().entries[id].launchedEvent).toBeUndefined()
    store.launchEvent(entry, 'library-por-tres')
    expect(useWorkspaceStore.getState().entries[id].launchedEvent?.definition.name).toBe('Por Tres')
    store.endEvent(entry)
    expect(useWorkspaceStore.getState().entries[id].launchedEvent?.endedAt).toBeTruthy()
  })
  it('snapshots final reports and prevents overwriting approved reports', () => {
    const t = createDemoTournament()
    const sets = [{ number: 1, a: 6, b: 4 }, { number: 2, a: 6, b: 3 }]
    expect(validateReportSets(sets)).toBeUndefined()
    expect(validateReportSets([{ number: 1, a: 6, b: 4 }, { number: 2, a: 3, b: 6 }])).toContain('Super Tie-Break')
    const report = buildMatchReport(t, t.matches[0], sets, 'Referee Ada')
    expect(report.result).toBe('2 - 0')
    expect(report.lineups.length).toBeGreaterThan(0)
    const store = useWorkspaceStore.getState()
    store.submitReport(report); sets[0].a = 99
    expect(useWorkspaceStore.getState().reports[0].sets[0].a).toBe(6)
    store.reviewReport(report.id, 'review', 'Check set 2')
    store.submitReport({ ...report, result: '2 - 1' })
    store.reviewReport(report.id, 'approved')
    store.submitReport({ ...report, result: '0 - 2' })
    expect(useWorkspaceStore.getState().reports[0].result).toBe('2 - 1')
  })
})
