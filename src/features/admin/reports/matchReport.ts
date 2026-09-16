import type { Match, Tournament } from '../../../shared/types/domain'
import type { DemoEvent } from '../../../demo/demoTypes'
import type { MatchReport, ReportSet } from '../workspace/workspaceStore'
import { getPlayerDisplayName } from '../../../shared/lib/playerNames'

export function validateReportSets(sets: ReportSet[]): string | undefined {
  if (sets.length < 2 || sets.length > 3) return 'Enter two sets and, if played, the Super Tie-Break.'
  if (sets.some(set => !Number.isInteger(set.a) || !Number.isInteger(set.b) || set.a < 0 || set.b < 0 || set.a === set.b)) return 'Every played set needs a valid result with a winner.'
  const firstTwoSplit = (sets[0].a > sets[0].b) !== (sets[1].a > sets[1].b)
  if (firstTwoSplit !== (sets.length === 3)) return 'Add the Super Tie-Break only when the first two sets are split.'
  return undefined
}
export function buildMatchReport(tournament: Tournament, match: Match, sets: ReportSet[], referee: string, events: DemoEvent[] = []): MatchReport {
  const teamName = (id: string) => tournament.teams.find(team => team.id === id)?.name ?? 'Squadra non disponibile'
  const a = sets.filter(set => set.a > set.b).length
  const b = sets.length - a
  return {
    id: `${tournament.id}:${match.id}`, tournamentId: tournament.id, matchId: match.id,
    court: tournament.courts.find(court => court.id === match.courtId)?.name ?? 'Campo non disponibile',
    teams: [teamName(match.teamAId), teamName(match.teamBId)], result: `${a} - ${b}`,
    sets: sets.map(set => ({ ...set })),
    lineups: match.lineups.filter(lineup => sets.some(set => set.number === lineup.setNumber)).map(lineup => ({
      set: lineup.setNumber, team: teamName(lineup.teamId), players: lineup.activePlayerIds.map(id => {
        const player = tournament.teams.flatMap(team => team.players).find(item => item.id === id)
        return player ? getPlayerDisplayName(player) : 'Giocatore non disponibile'
      }),
    })),
    cards: tournament.teamCards.filter(card => card.matchId === match.id && ['active', 'used'].includes(card.state)).map(card => ({ team: teamName(card.teamId), title: tournament.cards.find(def => def.id === card.cardId)?.name ?? 'Card unavailable' })),
    prizes: events.filter(event => event.matchId === match.id && event.type === 'GLOBAL_EVENT_WON').map(event => `${String(event.payload.playerName ?? event.payload.teamName ?? 'Vincitore')} / ${String(event.payload.prize ?? 'Premio')}`),
    referee, submittedAt: new Date().toISOString(), status: 'submitted',
  }
}
