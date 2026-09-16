import type { GenderStartingScore } from '../types/domain'

export function GenderBonusBadge({ score }: { score: GenderStartingScore }) {
  return (
    <div className="rounded border border-[var(--event-primary)]/30 bg-[var(--event-primary)]/10 px-3 py-2 text-sm font-bold text-[var(--event-primary)]">
      Bonus donne: {label(score.teamA)}-{label(score.teamB)} a ogni nuovo game
    </div>
  )
}

function label(value: 0 | 1 | 2) {
  if (value === 2) return '30'
  if (value === 1) return '15'
  return '0'
}
