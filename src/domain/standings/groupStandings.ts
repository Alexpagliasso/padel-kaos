import type { MatchEvent, Standing, Tournament } from '../../shared/types/domain'

export type StandingRow = { team: Tournament['teams'][number]; standing: Standing }

function setResult(events: MatchEvent[], matchId: string, setNumber: number) {
  const event = [...events].reverse().find(item => item.matchId === matchId && item.type === 'SET_WON' && Number(item.payload.set_number) === setNumber)
  return event ? { a: Number(event.payload.games_a), b: Number(event.payload.games_b) } : null
}

export function calculateTournamentStandings(tournament: Tournament): Standing[] {
  const table = new Map(tournament.teams.map(team => [team.id, { teamId: team.id, played: 0, won: 0, lost: 0, points: 0 }]))
  tournament.matches.filter(match => match.status === 'completed' && match.resultConfirmedAt).forEach(match => {
    const a = table.get(match.teamAId); const b = table.get(match.teamBId)
    if (!a || !b) return
    const first = setResult(tournament.matchEvents, match.id, 1); const second = setResult(tournament.matchEvents, match.id, 2)
    if (!first || !second) return
    let winsA = Number(first.a > first.b) + Number(second.a > second.b)
    let winsB = Number(first.b > first.a) + Number(second.b > second.a)
    if (winsA === winsB && match.superTiebreakA !== undefined && match.superTiebreakB !== undefined) {
      winsA += Number(match.superTiebreakA > match.superTiebreakB); winsB += Number(match.superTiebreakB > match.superTiebreakA)
    }
    if (winsA === winsB) return
    a.played++; b.played++
    const winner = winsA > winsB ? a : b; const loser = winsA > winsB ? b : a
    winner.won++; loser.lost++
  })
  return [...table.values()]
}

export function groupStandings(tournament: Tournament, groupId: string): StandingRow[] {
  const standings = calculateTournamentStandings(tournament)
  return tournament.teams.filter(team => team.groupId === groupId).map(team => ({ team, standing: standings.find(item => item.teamId === team.id)! }))
    .sort((a,b) => b.standing.won-a.standing.won || a.team.name.localeCompare(b.team.name,'it'))
}
