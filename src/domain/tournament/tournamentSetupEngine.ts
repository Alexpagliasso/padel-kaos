import { calculateBracketPlan, generateBracket, nextPowerOfTwo } from './bracketEngine'
import { calculateGroupPlan, calculateGroupDistribution } from './groupEngine'
import type { GroupStanding, SetupIssue, SetupValidation, TournamentSetupConfig, TournamentSetupPlan } from './tournamentTypes'

export function validateTournamentSetup(config: TournamentSetupConfig): SetupValidation {
  const errors: SetupIssue[] = []
  const warnings: SetupIssue[] = []
  const minimums = { teamsCount: 2, teamsPerGroup: 2, goldQualifiedCount: 0, silverQualifiedCount: 0, courtsCount: 1 } as const
  for (const [field, min] of Object.entries(minimums) as [keyof typeof minimums, number][]) {
    if (!Number.isSafeInteger(config[field]) || config[field] < min) errors.push({ code: 'INVALID_INTEGER', field, message: `${field} deve essere un intero almeno pari a ${min}.` })
  }
  for (const field of ['goldQualifiedCount', 'silverQualifiedCount'] as const) {
    if (config[field] === 1) errors.push({ code: 'SINGLE_QUALIFIER', field, message: `${field}: scegli 0 oppure almeno 2 qualificate.` })
  }
  if (config.goldQualifiedCount + config.silverQualifiedCount > config.teamsCount) errors.push({ code: 'TOO_MANY_QUALIFIERS', field: 'goldQualifiedCount', message: 'Le qualificate Gold e Silver non possono superare il numero di squadre.' })
  if (typeof config.allowByes !== 'boolean') errors.push({ code: 'INVALID_BYE_POLICY', field: 'allowByes', message: 'La scelta dei BYE deve essere valida.' })
  // Allocation guard: fail explicitly rather than freezing the setup UI on malformed huge counts.
  if (config.teamsCount > 65536) errors.push({ code: 'CAPACITY_EXCEEDED', field: 'teamsCount', message: 'Sono supportate fino a 65.536 squadre.' })
  if (config.courtsCount > 65536) errors.push({ code: 'CAPACITY_EXCEEDED', field: 'courtsCount', message: 'Sono supportati fino a 65.536 campi.' })
  if (!errors.length) {
    const groups = calculateGroupDistribution(config.teamsCount, config.teamsPerGroup)
    if (config.courtsCount !== groups.groupCount) errors.push({ code: 'COURT_GROUP_MISMATCH', field: 'courtsCount', message: `Il numero di campi deve corrispondere al numero di gironi (${groups.groupCount}).` })
    if (groups.groupSizes.some(size => size !== config.teamsPerGroup)) warnings.push({ code: 'BALANCED_GROUPS', field: 'teamsPerGroup', message: 'Le dimensioni dei gironi sono bilanciate rispetto al valore preferito.' })
    for (const field of ['goldQualifiedCount', 'silverQualifiedCount'] as const) {
      if (!config.allowByes && config[field] > 1 && nextPowerOfTwo(config[field]) !== config[field]) errors.push({ code: 'BYES_DISABLED', field, message: 'Questo numero di qualificate richiede dei BYE. Abilitali oppure scegli una potenza di due.' })
    }
  }
  return { valid: !errors.length, errors, warnings }
}

export function calculateTournamentSetup(config: TournamentSetupConfig): SetupValidation & { plan: TournamentSetupPlan | null } {
  const validation = validateTournamentSetup(config)
  if (!validation.valid) return { ...validation, plan: null }
  const groups = calculateGroupPlan(config.teamsCount, config.teamsPerGroup)
  const goldBracket = calculateBracketPlan(config.goldQualifiedCount)
  const silverBracket = calculateBracketPlan(config.silverQualifiedCount)
  return { ...validation, plan: { config: { ...config }, groups, goldBracket, silverBracket,
    eliminatedCount: config.teamsCount - config.goldQualifiedCount - config.silverQualifiedCount,
    recommendedCourts: groups.groupCount, totalGroupMatches: groups.totalGroupMatches,
    goldMatches: goldBracket.matchesPlayed, silverMatches: silverBracket.matchesPlayed,
    totalTournamentMatches: groups.totalGroupMatches + goldBracket.matchesPlayed + silverBracket.matchesPlayed } }
}

/** Input is already globally ordered by the external standings/tie-break engine. Never re-sort it here. */
export function selectQualifiedTeams<T extends Pick<GroupStanding, 'teamId'>>(standings: readonly T[], goldCount: number, silverCount: number) {
  calculateBracketPlan(goldCount)
  calculateBracketPlan(silverCount)
  if (goldCount + silverCount > standings.length) throw new RangeError('Not enough ranked teams.')
  if (new Set(standings.map(team => team.teamId)).size !== standings.length || standings.some(team => !team.teamId)) throw new Error('Ranked team IDs must be nonempty and unique.')
  const seeded = (teams: readonly T[]) => teams.map((team, index) => ({ id: team.teamId, seed: index + 1 }))
  return { goldTeams: seeded(standings.slice(0, goldCount)), silverTeams: seeded(standings.slice(goldCount, goldCount + silverCount)), eliminatedTeams: standings.slice(goldCount + silverCount).map(team => ({ ...team })) }
}

export function generateTournamentBrackets(orderedTeams: readonly Pick<GroupStanding, 'teamId'>[], goldCount: number, silverCount: number) {
  const selection = selectQualifiedTeams(orderedTeams, goldCount, silverCount)
  return { goldBracket: generateBracket(selection.goldTeams, 'gold'), silverBracket: generateBracket(selection.silverTeams, 'silver') }
}
