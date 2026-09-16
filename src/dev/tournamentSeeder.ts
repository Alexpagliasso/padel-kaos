import type { Team, Tournament } from '../shared/types/domain'
import { createTeamRosterDraft, validateTeamRosterDraft } from '../features/admin/setup/teamRosterFormState'
import type { SeedOptions } from './devDataTypes'
import { mockTeams, validateMockDataset } from './mockTeams'

function seededRandom(seed: string) {
  let value = 2166136261
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return () => { value += 0x6D2B79F5; let n = value; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296 }
}
export function generateTestTeams(options: SeedOptions): Team[] {
  validateMockDataset()
  if (!options.tournamentId.trim()) throw new Error('Il torneo è obbligatorio.')
  if (options.count > 33) throw new Error('Test dataset supports a maximum of 33 teams.')
  if (!Number.isInteger(options.count) || options.count < 0) throw new Error('Il numero di squadre deve essere un intero non negativo.')
  const random = options.mode === 'deterministic' ? seededRandom(options.seed ?? options.tournamentId) : Math.random
  const pool = mockTeams.filter(team => !options.filter || ['all', 'balanced'].includes(options.filter) || team.composition === options.filter)
  if (options.count > pool.length) throw new Error(`Selected filter supports only ${pool.length} teams.`)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  const ordered = options.filter === 'balanced' ? Array.from({ length: 11 }, (_, i) => ['male', 'female', 'mixed'].map(composition => pool.filter(team => team.composition === composition)[i])).flat() : pool
  return ordered.slice(0, options.count).map(template => {
    const id = `${options.tournamentId}:${template.id}`
    const team: Team = { id, name: template.name, shortName: template.name.split(' ').map(word => word[0]).join('').slice(0, 4).toUpperCase(), color: '#F5A623', groupId: '', ranking: null, isTestData: true,
      players: template.players.map(player => ({ ...player, id: `${options.tournamentId}:${player.id}`, teamId: id, name: `${player.firstName} ${player.lastName}`, nickname: player.firstName, gender: player.gender === 'male' ? 'man' : 'woman', accessToken: '', isTestData: true })) }
    const validation = validateTeamRosterDraft(createTeamRosterDraft(team))
    if (!validation.valid) throw new Error(validation.reason)
    return team
  })
}
export function removeTestData(tournament: Tournament): Tournament {
  const ids = new Set(tournament.teams.filter(team => team.isTestData).map(team => team.id))
  const players = new Set(tournament.teams.filter(team => ids.has(team.id)).flatMap(team => team.players.map(player => player.id)))
  const matches = new Set(tournament.matches.filter(match => ids.has(match.teamAId) || ids.has(match.teamBId)).map(match => match.id))
  return { ...tournament, teams: tournament.teams.filter(team => !ids.has(team.id)), matches: tournament.matches.filter(match => !matches.has(match.id)),
    teamCards: tournament.teamCards.filter(card => !ids.has(card.teamId) && !ids.has(card.stolenFromTeamId ?? '') && !matches.has(card.matchId ?? '')),
    standings: tournament.standings.filter(row => !ids.has(row.teamId)), kaosEvents: tournament.kaosEvents.filter(event => !matches.has(event.matchId)), matchEvents: tournament.matchEvents.filter(event => !matches.has(event.matchId)),
    globalEvents: tournament.globalEvents.map(event => ids.has(event.winnerTeamId ?? '') || players.has(event.winnerPlayerId ?? '') ? { ...event, winnerTeamId: undefined, winnerPlayerId: undefined } : event) }
}
export function seedTournament(tournament: Tournament, options: SeedOptions): Tournament {
  if (options.tournamentId !== tournament.id) throw new Error('Selected tournament does not match seed target.')
  if (options.count > 33) throw new Error('Test dataset supports a maximum of 33 teams.')
  const clean = removeTestData(tournament)
  if (clean.teams.length > options.count) throw new Error('Le squadre manuali superano il totale richiesto. Nessuna squadra è stata modificata.')
  const generated = generateTestTeams({ ...options, count: options.count - clean.teams.length })
  if (generated.some(team => clean.teams.some(real => real.name.toLowerCase() === team.name.toLowerCase() || real.id === team.id))) throw new Error('A manual team conflicts with the selected test templates. Choose another seed or rename the manual team.')
  return { ...clean, teams: [...clean.teams, ...generated] }
}
