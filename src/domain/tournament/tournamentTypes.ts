export type TournamentSetupConfig = {
  teamsCount: number
  teamsPerGroup: number
  goldQualifiedCount: number
  silverQualifiedCount: number
  courtsCount: number
  allowByes: boolean
}

export type SetupIssue = {
  code: string
  field: keyof TournamentSetupConfig
  message: string
}
export type SetupValidation = { valid: boolean; errors: SetupIssue[]; warnings: SetupIssue[] }
export type GroupDistribution = { groupCount: number; groupSizes: number[]; totalTeams: number }
export type GroupPlan = GroupDistribution & {
  groupMatchCounts: number[]
  totalGroupMatches: number
  /** One value per group: each member plays this many matches. */
  matchesPerTeam: number[]
}
export type BracketPlan = {
  qualifiedTeams: number
  bracketSize: number
  byeCount: number
  rounds: number
  /** Entrant positions, including empty positions awarded as byes. */
  totalBracketSlots: number
  matchesPlayed: number
  firstRoundMatches: number
  firstRoundByes: number
  roundLabels: string[]
}
export type BracketType = 'gold' | 'silver'
export type QualifiedTeam = { id: string; seed: number }
export type BracketSlot = {
  id: string
  bracketType: BracketType
  roundNumber: number
  position: number
  homeSeed: number | null
  awaySeed: number | null
  homeTeamId: string | null
  awayTeamId: string | null
  winnerTeamId: string | null
  isBye: boolean
  advancesToId: string | null
  advancesToSlot: 'home' | 'away' | null
}
export type GroupStanding = {
  teamId: string
  groupId: string
  position: number
  points: number
}
export type TournamentSetupPlan = {
  config: TournamentSetupConfig
  groups: GroupPlan
  goldBracket: BracketPlan
  silverBracket: BracketPlan
  eliminatedCount: number
  recommendedCourts: number
  totalGroupMatches: number
  goldMatches: number
  silverMatches: number
  totalTournamentMatches: number
}
