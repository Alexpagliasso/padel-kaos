import type { BracketPlan, BracketSlot, BracketType, QualifiedTeam } from './tournamentTypes'

export function nextPowerOfTwo(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Expected a positive safe integer.')
  let result = 1
  while (result < value) result *= 2
  if (!Number.isSafeInteger(result)) throw new RangeError('Bracket size exceeds safe integer precision.')
  return result
}

export function calculateBracketPlan(qualifiedCount: number): BracketPlan {
  if (!Number.isSafeInteger(qualifiedCount) || qualifiedCount < 0 || qualifiedCount === 1) throw new RangeError('A bracket needs zero or at least two qualifiers.')
  if (qualifiedCount === 0) return { qualifiedTeams: 0, bracketSize: 0, byeCount: 0, rounds: 0, totalBracketSlots: 0, matchesPlayed: 0, firstRoundMatches: 0, firstRoundByes: 0, roundLabels: [] }
  const bracketSize = nextPowerOfTwo(qualifiedCount)
  const byeCount = bracketSize - qualifiedCount
  const rounds = Math.log2(bracketSize)
  const roundLabels = Array.from({ length: rounds }, (_, i) => {
    const size = bracketSize / 2 ** i
    return size === 2 ? 'Final' : size === 4 ? 'Semifinals' : size === 8 ? 'Quarterfinals' : `Round of ${size}`
  })
  return { qualifiedTeams: qualifiedCount, bracketSize, byeCount, rounds, totalBracketSlots: bracketSize, matchesPlayed: qualifiedCount - 1, firstRoundMatches: bracketSize / 2 - byeCount, firstRoundByes: byeCount, roundLabels }
}

export function generateSeedPositions(bracketSize: number): number[] {
  if (bracketSize < 2 || nextPowerOfTwo(bracketSize) !== bracketSize) throw new RangeError('Bracket size must be a power of two of at least 2.')
  if (bracketSize > 65536) throw new RangeError('Bracket generation supports up to 65,536 entrants.')
  let positions = [1, 2]
  for (let size = 4; size <= bracketSize; size *= 2) positions = positions.flatMap(seed => [seed, size + 1 - seed])
  return positions
}

function slotId(type: BracketType, round: number, position: number) { return `${type}-r${round}-m${position}` }

/** Seeds must be unique and contiguous 1..N; absent entrants are null, never fake teams. */
export function assignFirstRoundSlots(qualifiedTeams: readonly QualifiedTeam[], bracketSize: number, bracketType: BracketType = 'gold'): BracketSlot[] {
  if (calculateBracketPlan(qualifiedTeams.length).bracketSize !== bracketSize || !qualifiedTeams.length) throw new RangeError('Bracket size must match the qualifier count.')
  const positions = generateSeedPositions(bracketSize)
  const bySeed = new Map(qualifiedTeams.map(team => [team.seed, team]))
  if (new Set(qualifiedTeams.map(team => team.id)).size !== qualifiedTeams.length || bySeed.size !== qualifiedTeams.length || qualifiedTeams.some(team => !team.id || !Number.isInteger(team.seed) || team.seed < 1 || team.seed > qualifiedTeams.length)) throw new Error('Team IDs and seeds must be unique, with seeds 1..N.')
  return Array.from({ length: bracketSize / 2 }, (_, index) => {
    const home = bySeed.get(positions[index * 2])
    const away = bySeed.get(positions[index * 2 + 1])
    const isBye = Boolean(home) !== Boolean(away)
    return {
      id: slotId(bracketType, 1, index + 1), bracketType, roundNumber: 1, position: index + 1,
      homeSeed: home?.seed ?? null, awaySeed: away?.seed ?? null,
      homeTeamId: home?.id ?? null, awayTeamId: away?.id ?? null,
      winnerTeamId: isBye ? home?.id ?? away?.id ?? null : null, isBye,
      advancesToId: bracketSize > 2 ? slotId(bracketType, 2, Math.floor(index / 2) + 1) : null,
      advancesToSlot: bracketSize > 2 ? index % 2 === 0 ? 'home' : 'away' : null,
    }
  })
}

export function generateBracket(qualifiedTeams: readonly QualifiedTeam[], bracketType: BracketType): BracketSlot[] {
  const plan = calculateBracketPlan(qualifiedTeams.length)
  if (!qualifiedTeams.length) return []
  const bracket = assignFirstRoundSlots(qualifiedTeams, plan.bracketSize, bracketType)
  for (let round = 2; round <= plan.rounds; round++) {
    const count = plan.bracketSize / 2 ** round
    for (let position = 1; position <= count; position++) {
      bracket.push({ id: slotId(bracketType, round, position), bracketType, roundNumber: round, position,
        homeSeed: null, awaySeed: null, homeTeamId: null, awayTeamId: null, winnerTeamId: null, isBye: false,
        advancesToId: round < plan.rounds ? slotId(bracketType, round + 1, Math.ceil(position / 2)) : null,
        advancesToSlot: round < plan.rounds ? position % 2 === 1 ? 'home' : 'away' : null })
    }
  }
  const byId = new Map(bracket.map(slot => [slot.id, slot]))
  // Only first-round byes advance automatically; an unresolved feeder is not a bye.
  for (const slot of bracket.filter(slot => slot.isBye)) {
    const target = slot.advancesToId ? byId.get(slot.advancesToId) : undefined
    if (target && slot.advancesToSlot) {
      target[`${slot.advancesToSlot}TeamId`] = slot.winnerTeamId
      target[`${slot.advancesToSlot}Seed`] = slot.homeSeed ?? slot.awaySeed
    }
  }
  return bracket
}

/** Results are immutable. Corrections to an already decided match require a separate reset policy. */
export function applyBracketResult(bracket: readonly BracketSlot[], matchId: string, winnerTeamId: string): BracketSlot[] {
  const match = bracket.find(slot => slot.id === matchId)
  if (!match) throw new Error('Match not found.')
  if (!winnerTeamId || ![match.homeTeamId, match.awayTeamId].includes(winnerTeamId)) throw new Error('Winner must belong to the match.')
  if (!match.isBye && (!match.homeTeamId || !match.awayTeamId)) throw new Error('Both participants must be known before a result is applied.')
  if (match.winnerTeamId && match.winnerTeamId !== winnerTeamId) throw new Error('A decided result cannot be overwritten.')
  const target = match.advancesToId ? bracket.find(slot => slot.id === match.advancesToId) : undefined
  if (match.advancesToId && (!target || !match.advancesToSlot || target.bracketType !== match.bracketType || target.roundNumber !== match.roundNumber + 1)) throw new Error('Invalid advancement link.')
  if (target && match.advancesToSlot && target[`${match.advancesToSlot}TeamId`] && target[`${match.advancesToSlot}TeamId`] !== winnerTeamId) throw new Error('Advancement slot is occupied.')
  const winnerSeed = match.homeTeamId === winnerTeamId ? match.homeSeed : match.awaySeed
  return bracket.map(slot => slot.id === matchId ? { ...slot, winnerTeamId }
    : target && slot.id === target.id && match.advancesToSlot ? { ...slot, [`${match.advancesToSlot}TeamId`]: winnerTeamId, [`${match.advancesToSlot}Seed`]: winnerSeed } : { ...slot })
}
