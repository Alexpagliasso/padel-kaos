import type { Match, Round } from '../../shared/types/domain'

export function roundCardsLocked(round: Round | undefined, matches: Match[]) {
  return Boolean(round?.openedAt || (round && round.status !== 'scheduled') || matches.some(match =>
    !['scheduled', 'ready'].includes(match.status) || Boolean(match.set1StartedAt),
  ))
}
