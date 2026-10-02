const SECONDS_PER_MINUTE = 60

/** Converts the Admin form value (minutes) to canonical persisted seconds. */
export function timedCardMinutesToSeconds(minutes: number): number {
  return minutes * SECONDS_PER_MINUTE
}

/** Converts canonical timed-card seconds to the value shown in Admin forms. */
export function timedCardSecondsToMinutes(seconds: number): number {
  return seconds / SECONDS_PER_MINUTE
}

export function formatTimedCardDuration(seconds: number): string {
  const minutes = timedCardSecondsToMinutes(seconds)
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}`
}
