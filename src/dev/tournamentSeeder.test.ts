// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockPlayers } from './mockPlayers'
import { mockTeams, validateMockDataset } from './mockTeams'
import { generateTestTeams, removeTestData, seedTournament } from './tournamentSeeder'
import { emptyTournament, entryFromTournament, useWorkspaceStore } from '../features/admin/workspace/workspaceStore'
import { useDemoStore } from '../demo/demoStore'
import { activateDemoTournament, installDemoTestData } from './demoTestData'
import { createTeamRosterDraft, validateTeamRosterDraft } from '../features/admin/setup/teamRosterFormState'
import { getAvailablePairs } from '../domain/rules/rulesEngine'

afterEach(() => vi.restoreAllMocks())
describe('immutable development dataset', () => {
  it('has exactly 99 unique named players assigned once to 33 unique three-player teams', () => {
    expect(validateMockDataset()).toBe(true)
    expect(mockPlayers).toHaveLength(99); expect(mockTeams).toHaveLength(33)
    expect(new Set(mockTeams.flatMap(team => team.players.map(player => player.id))).size).toBe(99)
    expect(new Set(mockPlayers.map(player => `${player.firstName} ${player.lastName}`)).size).toBe(99)
    expect(mockPlayers[0].id).toBe('mock-player-001'); expect(mockPlayers[98].id).toBe('mock-player-099')
    expect(mockTeams[32].id).toBe('mock-team-033')
    expect(Object.isFrozen(mockPlayers[0])).toBe(true); expect(Object.isFrozen(mockTeams[0].players)).toBe(true)
  })
  it('has eleven teams per composition, with both mixed variants', () => {
    for (const composition of ['male', 'female', 'mixed']) expect(mockTeams.filter(team => team.composition === composition)).toHaveLength(11)
    expect(mockTeams.filter(team => team.composition === 'male').every(team => team.players.every(player => player.gender === 'male'))).toBe(true)
    expect(mockTeams.filter(team => team.composition === 'female').every(team => team.players.every(player => player.gender === 'female'))).toBe(true)
    expect(new Set(mockTeams.filter(team => team.composition === 'mixed').map(team => team.players.filter(player => player.gender === 'male').length))).toEqual(new Set([1, 2]))
  })
  it('reports corrupt counts, duplicates, roster assignments and compositions', () => {
    expect(() => validateMockDataset(mockPlayers.slice(1))).toThrow('99 players')
    expect(() => validateMockDataset(mockPlayers, mockTeams.slice(1))).toThrow('33 teams')
    expect(() => validateMockDataset([mockPlayers[1], ...mockPlayers.slice(1)])).toThrow('IDs must be unique')
    expect(() => validateMockDataset(mockPlayers, [{ ...mockTeams[0], name: mockTeams[1].name }, ...mockTeams.slice(1)])).toThrow('names must be unique')
    expect(() => validateMockDataset(mockPlayers, [{ ...mockTeams[0], players: mockTeams[1].players }, ...mockTeams.slice(1)])).toThrow('exactly once')
    expect(() => validateMockDataset(mockPlayers, [{ ...mockTeams[0], composition: 'female' }, ...mockTeams.slice(1)])).toThrow('composition')
    expect(() => validateMockDataset(mockPlayers, [{ ...mockTeams[0], players: [] }, ...mockTeams.slice(1)])).toThrow('exactly 3')
  })
})
describe('tournament seeding', () => {
  it.each([12, 30, 33])('generates %i unique normal domain teams with valid lineups', count => {
    const teams = generateTestTeams({ tournamentId: 'a', count, mode: 'random' })
    expect(teams).toHaveLength(count)
    expect(new Set(teams.map(team => team.id)).size).toBe(count)
    expect(new Set(teams.flatMap(team => team.players.map(player => player.id))).size).toBe(count * 3)
    for (const team of teams) {
      expect(validateTeamRosterDraft(createTeamRosterDraft(team)).valid).toBe(true)
      expect(getAvailablePairs(team.players, [])).toHaveLength(3)
      expect(team.players.every(player => player.teamId === team.id && player.isTestData && player.name && ['man', 'woman'].includes(player.gender))).toBe(true)
    }
  })
  it('is reproducible by seed and isolates entities from other tournaments and templates', () => {
    const options = { tournamentId: 'a', count: 12, mode: 'deterministic' as const, seed: 'repeat' }
    const a = generateTestTeams(options)
    expect(generateTestTeams(options)).toEqual(a)
    expect(generateTestTeams({ ...options, seed: 'different' }).map(team => team.id)).not.toEqual(a.map(team => team.id))
    const b = generateTestTeams({ ...options, tournamentId: 'b' })
    expect(b.map(team => team.name)).toEqual(a.map(team => team.name))
    expect(b.every(team => !a.some(other => other.id === team.id))).toBe(true)
    a[0].players[0].firstName = 'Changed'
    expect(b[0].players[0].firstName).not.toBe('Changed')
    expect(validateMockDataset()).toBe(true)
  })
  it('uses randomness, supports approximate balance and refuses impossible requests', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const a = generateTestTeams({ tournamentId: 'a', count: 12, mode: 'random' })
    vi.mocked(Math.random).mockReturnValue(0.99)
    expect(generateTestTeams({ tournamentId: 'a', count: 12, mode: 'random' })).not.toEqual(a)
    const balanced = generateTestTeams({ tournamentId: 'a', count: 8, mode: 'random', filter: 'balanced' })
    expect(balanced.filter(team => team.players.every(player => player.gender === 'man'))).toHaveLength(3)
    expect(() => generateTestTeams({ tournamentId: 'a', count: 34, mode: 'random' })).toThrow('Test dataset supports a maximum of 33 teams.')
    expect(() => generateTestTeams({ tournamentId: 'a', count: 12, mode: 'random', filter: 'male' })).toThrow('only 11')
  })
  it('replaces only generated entities and preserves unrelated manual data', () => {
    const tournament = emptyTournament('a', 'A')
    const manual = { ...generateTestTeams({ tournamentId: 'real', count: 1, mode: 'deterministic' })[0], name: 'Manual', isTestData: undefined }
    tournament.teams = [manual]
    const seeded = seedTournament(tournament, { tournamentId: 'a', count: 12, mode: 'deterministic' })
    expect(seeded.teams).toHaveLength(12); expect(seeded.teams[0]).toBe(manual)
    const testId = seeded.teams[1].id
    seeded.teamCards = [{ id: 'real-card', cardId: 'c', teamId: manual.id, state: 'available' }, { id: 'test-card', cardId: 'c', teamId: testId, state: 'available' }]
    seeded.standings = [{ teamId: testId, played: 0, won: 0, lost: 0, points: 0 }]
    const cleaned = removeTestData(seeded)
    expect(cleaned.teams).toEqual([manual]); expect(cleaned.teamCards.map(card => card.id)).toEqual(['real-card']); expect(cleaned.standings).toEqual([])
    expect(tournament.teams).toEqual([manual])
    expect(seedTournament(seeded, { tournamentId: 'a', count: 12, mode: 'deterministic' }).teams).toHaveLength(12)
    expect(() => seedTournament(tournament, { tournamentId: 'b', count: 12, mode: 'random' })).toThrow('does not match')
  })
  it('persists separate tournament configurations and supports normal demo matches and cleanup', async () => {
    useDemoStore.getState().resetDemo()
    useWorkspaceStore.setState({ entries: {}, selectedId: null, reports: [] })
    const a = entryFromTournament(emptyTournament('dev-a', 'A'))
    a.config = { ...a.config, teamsCount: 30, teamsPerGroup: 5, goldQualifiedCount: 12, silverQualifiedCount: 12 }
    a.domain.courts = [{ id: 'court', name: 'Court' }]
    installDemoTestData(a, seedTournament(a.domain, { tournamentId: a.domain.id, count: 30, mode: 'deterministic' }))
    const teams = useDemoStore.getState().tournament.teams
    useDemoStore.getState().createMatch({ teamAId: teams[0].id, teamBId: teams[1].id, courtId: 'court', teamAActivePlayerIds: [teams[0].players[0].id, teams[0].players[1].id], teamBActivePlayerIds: [teams[1].players[0].id, teams[1].players[1].id] })
    const matchId = useDemoStore.getState().selectedMatchId
    expect(useDemoStore.getState().tournament.matches.find(match => match.id === matchId)?.lineups).toHaveLength(2)
    useDemoStore.setState({ porTresPrizeDraft: 'Manual prize' })
    const b = entryFromTournament(emptyTournament('dev-b', 'B'))
    b.config = { ...b.config, teamsCount: 12, teamsPerGroup: 4, goldQualifiedCount: 4, silverQualifiedCount: 4 }
    installDemoTestData(b, seedTournament(b.domain, { tournamentId: b.domain.id, count: 12, mode: 'deterministic' }))
    activateDemoTournament('dev-a')
    expect(useDemoStore.getState().tournament.teams).toHaveLength(30)
    expect(useDemoStore.getState().tournament.matches).toHaveLength(1)
    expect(useDemoStore.getState().porTresPrizeDraft).toBe('Manual prize')
    expect(useDemoStore.getState().savedWorkspaces?.['dev-b'].config.teamsPerGroup).toBe(4)
    await useDemoStore.persist.rehydrate()
    expect(useDemoStore.getState().savedWorkspaces?.['dev-a'].config.goldQualifiedCount).toBe(12)
    const current = useDemoStore.getState().tournament
    installDemoTestData({ ...a, domain: current }, removeTestData(current))
    expect(useDemoStore.getState().tournament.matches).toEqual([])
    expect(useDemoStore.getState().porTresPrizeDraft).toBe('Manual prize')
    activateDemoTournament('dev-b')
    expect(useDemoStore.getState().tournament.teams).toHaveLength(12)
    useDemoStore.getState().resetDemo()
    useWorkspaceStore.setState({ entries: {}, selectedId: null, reports: [] })
  })
})
