import { describe, expect, it } from 'vitest'
import { applyBracketResult, assignFirstRoundSlots, calculateBracketPlan, generateBracket, generateSeedPositions, nextPowerOfTwo } from './bracketEngine'
import { calculateGroupDistribution, calculateGroupPlan, roundRobinMatchCount } from './groupEngine'
import { calculateTournamentSetup, generateTournamentBrackets, selectQualifiedTeams, validateTournamentSetup } from './tournamentSetupEngine'
import type { TournamentSetupConfig } from './tournamentTypes'

const config: TournamentSetupConfig = { teamsCount: 30, teamsPerGroup: 5, goldQualifiedCount: 12, silverQualifiedCount: 12, courtsCount: 6, allowByes: true }
const teams = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 }))

describe('groups and tournament setup', () => {
  it('calculates the exact 30-team / 12 Gold / 12 Silver example', () => {
    const result = calculateTournamentSetup(Object.freeze(config))
    expect(result.valid).toBe(true)
    expect(result.plan).toMatchObject({
      groups: { groupCount: 6, groupSizes: [5, 5, 5, 5, 5, 5], groupMatchCounts: [10, 10, 10, 10, 10, 10], totalGroupMatches: 60, matchesPerTeam: [4, 4, 4, 4, 4, 4] },
      goldBracket: { bracketSize: 16, byeCount: 4, matchesPlayed: 11 }, silverBracket: { bracketSize: 16, byeCount: 4, matchesPlayed: 11 },
      eliminatedCount: 6, totalTournamentMatches: 82, recommendedCourts: 6,
    })
    expect(result.plan?.config).not.toBe(config)
  })
  it.each([[30, [5, 5, 5, 5, 5, 5]], [25, [5, 5, 5, 5, 5]], [20, [5, 5, 5, 5]], [23, [5, 5, 5, 4, 4]], [24, [5, 5, 5, 5, 4]]] as const)('balances %i teams', (count, sizes) => {
    const result = calculateGroupPlan(count, 5)
    expect(result.groupSizes).toEqual(sizes)
    expect(result.groupMatchCounts).toEqual(sizes.map(size => size * (size - 1) / 2))
    expect(result.totalGroupMatches).toBe(result.groupMatchCounts.reduce((sum, n) => sum + n, 0))
  })
  it('supports other group sizes without singletons, missing teams or imbalance', () => {
    for (let count = 2; count <= 100; count++) for (let preferred = 2; preferred <= 10; preferred++) {
      const result = calculateGroupDistribution(count, preferred)
      expect(result.groupSizes.reduce((sum, size) => sum + size, 0)).toBe(count)
      expect(Math.max(...result.groupSizes) - Math.min(...result.groupSizes)).toBeLessThanOrEqual(1)
      expect(Math.min(...result.groupSizes)).toBeGreaterThanOrEqual(2)
    }
    expect(calculateGroupDistribution(12, 4).groupSizes).toEqual([4, 4, 4])
    expect(roundRobinMatchCount(5)).toBe(10)
    expect(roundRobinMatchCount(0)).toBe(0)
    expect(roundRobinMatchCount(1)).toBe(0)
  })
  it.each([
    { teamsCount: 1 }, { teamsCount: NaN }, { teamsCount: Infinity }, { teamsCount: 2.5 },
    { teamsPerGroup: 1 }, { teamsPerGroup: 0 }, { goldQualifiedCount: -1 }, { silverQualifiedCount: -1 },
    { goldQualifiedCount: 1 }, { silverQualifiedCount: 1 }, { goldQualifiedCount: 24 },
    { courtsCount: 0 }, { courtsCount: 1.5 }, { courtsCount: Infinity }, { allowByes: false },
  ])('returns structured errors and no plan for %j', change => {
    const result = calculateTournamentSetup({ ...config, ...change })
    expect(result.valid).toBe(false)
    expect(result.plan).toBeNull()
    expect(result.errors[0]).toEqual(expect.objectContaining({ code: expect.any(String), field: expect.any(String), message: expect.any(String) }))
  })
  it('requires one court per group and treats zero qualifiers as disabled brackets', () => {
    const result = calculateTournamentSetup({ ...config, courtsCount: 4, goldQualifiedCount: 0, silverQualifiedCount: 0 })
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.code === 'COURT_GROUP_MISMATCH')).toBe(true)
    expect(result.plan).toBeNull()
    expect(calculateTournamentSetup({ ...config, goldQualifiedCount: 0, silverQualifiedCount: 0 }).plan).toMatchObject({ totalTournamentMatches: 60, eliminatedCount: 30, goldMatches: 0, silverMatches: 0 })
    expect(validateTournamentSetup({ ...config, goldQualifiedCount: 8, silverQualifiedCount: 8, allowByes: false }).valid).toBe(true)
  })
})

describe('bracket plans and deterministic seeding', () => {
  it.each([[2, 2], [3, 4], [4, 4], [5, 8], [8, 8], [10, 16], [12, 16], [16, 16], [20, 32]])('next power of two %i = %i', (value, expected) => expect(nextPowerOfTwo(value)).toBe(expected))
  it.each([0, -1, NaN, Infinity, 2.5])('rejects invalid power input %s', value => expect(() => nextPowerOfTwo(value)).toThrow())
  it('avoids bitwise overflow and rejects excessive materialized structures safely', () => {
    expect(nextPowerOfTwo(2 ** 32 + 1)).toBe(2 ** 33)
    expect(() => nextPowerOfTwo(Number.MAX_SAFE_INTEGER)).toThrow()
    expect(() => generateSeedPositions(2 ** 20)).toThrow()
    expect(() => calculateGroupDistribution(2 ** 20, 5)).toThrow()
    expect(validateTournamentSetup({ ...config, courtsCount: 2 ** 30 }).valid).toBe(false)
  })
  it.each([[8, 8, 0, 7], [10, 16, 6, 9], [12, 16, 4, 11], [16, 16, 0, 15], [20, 32, 12, 19]])('plans %i qualifiers', (qualified, size, byes, played) => {
    expect(calculateBracketPlan(qualified)).toMatchObject({ bracketSize: size, byeCount: byes, matchesPlayed: played, firstRoundMatches: size / 2 - byes, firstRoundByes: byes, rounds: Math.log2(size) })
  })
  it('provides labels and explicit zero/one semantics', () => {
    expect(calculateBracketPlan(20).roundLabels).toEqual(['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'])
    expect(calculateBracketPlan(0).matchesPlayed).toBe(0)
    expect(calculateBracketPlan(0).rounds).toBe(0)
    expect(() => calculateBracketPlan(1)).toThrow()
    expect(generateBracket([], 'silver')).toEqual([])
  })
  it('places higher seeds across bracket halves deterministically', () => {
    expect(generateSeedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    const entrants = Object.freeze(teams(12).map(team => Object.freeze(team)))
    const slots = assignFirstRoundSlots(entrants, 16)
    expect(slots.filter(slot => slot.isBye).map(slot => slot.homeSeed ?? slot.awaySeed).sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4])
    expect(slots.filter(slot => slot.isBye).map(slot => slot.position)).toEqual([1, 3, 5, 7])
    expect(assignFirstRoundSlots([...entrants].reverse(), 16)).toEqual(slots)
    expect(() => assignFirstRoundSlots([{ id: 'a', seed: 1 }, { id: 'a', seed: 2 }], 2)).toThrow()
    expect(() => assignFirstRoundSlots([{ id: 'a', seed: 1 }, { id: 'b', seed: 3 }], 2)).toThrow()
  })
  it('automatically propagates every bye and never treats unresolved feeders as byes', () => {
    const bracket = generateBracket(teams(12), 'gold')
    const byes = bracket.filter(slot => slot.isBye)
    expect(byes).toHaveLength(4)
    expect(bracket.filter(slot => !slot.isBye)).toHaveLength(11)
    for (const slot of byes) {
      expect([slot.homeTeamId, slot.awayTeamId].filter(Boolean)).toHaveLength(1)
      expect(slot.winnerTeamId).toBe(slot.homeTeamId ?? slot.awayTeamId)
      const target = bracket.find(item => item.id === slot.advancesToId)!
      expect(target[`${slot.advancesToSlot!}TeamId`]).toBe(slot.winnerTeamId)
      expect(target.isBye).toBe(false)
      expect(target.winnerTeamId).toBeNull()
    }
    expect(bracket.some(slot => slot.homeTeamId === 'BYE' || slot.awayTeamId === 'BYE')).toBe(false)
  })
})

describe('qualification and result propagation', () => {
  it('consumes the existing ordered ranking without applying tie-break policy', () => {
    const ranking = Object.freeze(Array.from({ length: 30 }, (_, i) => Object.freeze({ teamId: `rank-${i + 1}`, groupId: 'group', position: 30 - i, points: i })))
    const result = selectQualifiedTeams(ranking, 12, 12)
    expect(result.goldTeams[0]).toEqual({ id: 'rank-1', seed: 1 })
    expect(result.silverTeams[0]).toEqual({ id: 'rank-13', seed: 1 })
    expect(result.eliminatedTeams.map(team => team.teamId)).toEqual(['rank-25', 'rank-26', 'rank-27', 'rank-28', 'rank-29', 'rank-30'])
    const brackets = generateTournamentBrackets(ranking, 12, 12)
    expect(brackets.goldBracket.every(slot => slot.id.startsWith('gold-'))).toBe(true)
    expect(brackets.silverBracket.every(slot => slot.id.startsWith('silver-'))).toBe(true)
    expect(() => selectQualifiedTeams(ranking, 20, 20)).toThrow()
    expect(() => selectQualifiedTeams([{ teamId: 'a' }, { teamId: 'a' }], 2, 0)).toThrow()
  })
  it('propagates into the linked slot without mutating any input', () => {
    const bracket = Object.freeze(generateBracket(teams(8), 'gold').map(slot => Object.freeze(slot)))
    const before = JSON.stringify(bracket)
    const next = applyBracketResult(bracket, 'gold-r1-m2', 'team-5')
    expect(JSON.stringify(bracket)).toBe(before)
    expect(next.find(slot => slot.id === 'gold-r2-m1')).toMatchObject({ awayTeamId: 'team-5', awaySeed: 5, homeTeamId: null })
    expect(next.find(slot => slot.id === 'gold-r1-m2')?.winnerTeamId).toBe('team-5')
    expect(next.filter(slot => !['gold-r1-m2', 'gold-r2-m1'].includes(slot.id))).toEqual(bracket.filter(slot => !['gold-r1-m2', 'gold-r2-m1'].includes(slot.id)))
    expect(() => applyBracketResult(bracket, 'missing', 'team-1')).toThrow()
    expect(() => applyBracketResult(bracket, 'gold-r1-m1', 'team-3')).toThrow()
    expect(() => applyBracketResult(next, 'gold-r2-m1', 'team-5')).toThrow()
    expect(() => applyBracketResult(next, 'gold-r1-m2', 'team-4')).toThrow()
    expect(applyBracketResult(next, 'gold-r1-m2', 'team-5')).toEqual(next)
  })
  it('can play each bracket through to one champion, counting no bye as a match', () => {
    for (const count of [2, 3, 5, 8, 10, 12, 16, 20]) {
      let bracket = generateBracket(teams(count), 'silver')
      let played = 0
      for (const original of bracket) {
        const slot = bracket.find(item => item.id === original.id)!
        if (slot.isBye) continue
        expect(slot.homeTeamId).toBeTruthy()
        expect(slot.awayTeamId).toBeTruthy()
        bracket = applyBracketResult(bracket, slot.id, slot.homeTeamId!)
        played++
      }
      expect(played).toBe(count - 1)
      expect(bracket.at(-1)?.winnerTeamId).toBeTruthy()
      expect(bracket.at(-1)?.advancesToId).toBeNull()
    }
  })
})
