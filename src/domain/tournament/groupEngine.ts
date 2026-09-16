import type { GroupDistribution, GroupPlan } from './tournamentTypes'

export function calculateGroupDistribution(teamsCount: number, preferredTeamsPerGroup: number): GroupDistribution {
  if (!Number.isSafeInteger(teamsCount) || teamsCount < 2 || !Number.isSafeInteger(preferredTeamsPerGroup) || preferredTeamsPerGroup < 2) {
    throw new RangeError('Il numero di squadre e la dimensione del girone devono essere interi di almeno 2.')
  }
  if (teamsCount > 65536) throw new RangeError('Sono supportate fino a 65.536 squadre.')
  // Avoid singleton groups, including the 3 teams / preferred size 2 case.
  const groupCount = Math.min(Math.ceil(teamsCount / preferredTeamsPerGroup), Math.floor(teamsCount / 2))
  const baseSize = Math.floor(teamsCount / groupCount)
  const remainder = teamsCount % groupCount
  return { groupCount, totalTeams: teamsCount, groupSizes: Array.from({ length: groupCount }, (_, i) => baseSize + (i < remainder ? 1 : 0)) }
}

export function roundRobinMatchCount(teamsCount: number): number {
  if (!Number.isSafeInteger(teamsCount) || teamsCount < 0) throw new RangeError('Team count must be a nonnegative integer.')
  if (teamsCount < 2) return 0
  const matches = teamsCount * (teamsCount - 1) / 2
  if (!Number.isSafeInteger(matches)) throw new RangeError('Match count exceeds safe integer precision.')
  return matches
}

export function calculateGroupPlan(teamsCount: number, teamsPerGroup: number): GroupPlan {
  const distribution = calculateGroupDistribution(teamsCount, teamsPerGroup)
  const groupMatchCounts = distribution.groupSizes.map(roundRobinMatchCount)
  return { ...distribution, groupMatchCounts, totalGroupMatches: groupMatchCounts.reduce((sum, count) => sum + count, 0), matchesPerTeam: distribution.groupSizes.map(size => size - 1) }
}
