import { mockPlayers } from './mockPlayers'
import type { MockPlayer, MockTeam } from './devDataTypes'

const names = ['Los Locos', 'Smash Bros', 'Golden Bandeja', 'No Look', 'Vibora Club', 'Glass Warriors', 'Padel Fiction', 'The Lobsters', 'Net Rebels', 'Chiquita Club', 'Bandeja Brothers', 'Las Panteras', 'Reinas del Padel', 'Pink Viboras', 'Golden Queens', 'Lob Ladies', 'Le Fenici', 'Smash Sisters', 'Stelle di Vetro', 'Las Leonas', 'Bandeja Bloom', 'Court Divas', 'Kaos Crew', 'Doppio Rimbalzo', 'Costa Smash', 'Sunset Rally', 'Punto Loco', 'Net Nomads', 'Vetro e Fuoco', 'Rally Republic', 'Bandeja Social', 'Luna Padel', 'Terzo Tempo']
export const mockTeams: readonly MockTeam[] = Object.freeze(names.map((name, i) => Object.freeze({
  id: `mock-team-${String(i + 1).padStart(3, '0')}`, name,
  composition: i < 11 ? 'male' as const : i < 22 ? 'female' as const : 'mixed' as const,
  players: Object.freeze(mockPlayers.slice(i * 3, i * 3 + 3)),
})))

export function validateMockDataset(players: readonly MockPlayer[] = mockPlayers, teams: readonly MockTeam[] = mockTeams) {
  const fail = (message: string): never => { throw new Error(`Invalid mock dataset: ${message}`) }
  if (players.length !== 99) fail('expected exactly 99 players.')
  if (teams.length !== 33) fail('expected exactly 33 teams.')
  const ids = [...players, ...teams].map(item => item.id)
  if (new Set(ids).size !== ids.length) fail('IDs must be unique.')
  if (new Set(teams.map(team => team.name.trim().toLowerCase())).size !== 33) fail('team names must be unique.')
  const used = new Set<string>()
  for (const player of players) {
    if (!player.firstName.trim() || !player.lastName.trim() || !['male', 'female'].includes(player.gender)) fail(`invalid player ${player.id}.`)
  }
  for (const team of teams) {
    if (!team.name.trim() || team.players.length !== 3) fail(`${team.id} requires a name and exactly 3 players.`)
    for (const player of team.players) {
      const original = players.find(item => item.id === player.id)
      if (!original || JSON.stringify(original) !== JSON.stringify(player) || used.has(player.id)) fail(`${player.id} must appear exactly once and match its template.`)
      used.add(player.id)
    }
    const males = team.players.filter(player => player.gender === 'male').length
    if (team.composition !== (males === 3 ? 'male' : males === 0 ? 'female' : 'mixed')) fail(`${team.id} composition does not match genders.`)
  }
  if (used.size !== 99) fail('every player must be assigned exactly once.')
  return true
}
