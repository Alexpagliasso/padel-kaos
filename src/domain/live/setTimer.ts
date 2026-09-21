import type { Match } from '../../shared/types/domain'

export const DEFAULT_SET_DURATION_MINUTES = 15

export function getSetTimer(match: Match, now = Date.now()) {
  const setNumber = match.status === 'live_set_1' ? 1 : match.status === 'live_set_2' && match.score.currentSet === 2 ? 2 : null
  const startedAt = setNumber === 1 ? match.set1StartedAt : setNumber === 2 ? match.set2StartedAt : undefined
  if (!setNumber || !startedAt) return null
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const durationSeconds = (match.activeSetDurationMinutes ?? DEFAULT_SET_DURATION_MINUTES) * 60
  return { setNumber, durationSeconds, remainingSeconds: Math.max(0, durationSeconds - elapsed), expired: elapsed >= durationSeconds }
}
