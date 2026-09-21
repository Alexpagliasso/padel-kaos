import type { Match, Tournament } from '../../shared/types/domain'

export type PersistedSetResult = { gamesA: number; gamesB: number }

export function getPersistedSetResult(tournament: Tournament, matchId: string, setNumber: 1 | 2): PersistedSetResult | undefined {
  const event = [...tournament.matchEvents].reverse().find(item => item.matchId === matchId && item.type === 'SET_WON' && Number(item.payload.set_number) === setNumber)
  if (!event) return undefined
  const gamesA = Number(event.payload.games_a)
  const gamesB = Number(event.payload.games_b)
  return Number.isInteger(gamesA) && gamesA >= 0 && Number.isInteger(gamesB) && gamesB >= 0 ? { gamesA, gamesB } : undefined
}

export function getDiceEffect(tournament: Tournament, match: Match, now = Date.now()) {
  const round = tournament.rounds?.find(item => item.id === match.roundId)
  const rule = tournament.diceRules.find(item => item.id === round?.diceRuleId)
  const durationSeconds = 300
  const startedAt = match.set2StartedAt ? new Date(match.set2StartedAt).getTime() : Number.NaN
  const endsAt = startedAt + durationSeconds * 1000
  const remainingSeconds = Number.isFinite(endsAt) ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0
  return { round, rule, remainingSeconds, active: match.status === 'live_set_2' && remainingSeconds > 0 }
}

export function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
