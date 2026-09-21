export type Role =
  | 'SUPER_ADMIN'
  | 'PLAYER'
  | 'REFEREE'
  | 'COURT_DISPLAY'
  | 'MAIN_DISPLAY'

export type MatchStatus =
  | 'scheduled'
  | 'lineup'
  | 'ready'
  | 'live'
  | 'live_set_1'
  | 'set_break'
  | 'lineup_set_2'
  | 'kaos_pending'
  | 'kaos_reveal'
  | 'kaos_event'
  | 'live_set_2'
  | 'super_tiebreak'
  | 'completed'

export type TournamentPhase = 'GROUP_STAGE' | 'KNOCKOUT'

export type RoundStage = 'group' | 'quarter_final' | 'semi_final' | 'final'

export type CardState = 'available' | 'pending' | 'active' | 'used' | 'cancelled' | 'expired'

export type MatchEventType =
  | 'MATCH_STARTED'
  | 'POINT_SCORED'
  | 'GAME_WON'
  | 'SET_WON'
  | 'LINEUP_CHANGED'
  | 'CARD_PLAYED'
  | 'CARD_ACTIVATED'
  | 'CARD_EXPIRED'
  | 'DICE_ROLLED'
  | 'KAOS_RULE_STARTED'
  | 'KAOS_RULE_ENDED'
  | 'SPECIAL_EVENT'
  | 'MATCH_COMPLETED'
  | 'SCORE_CORRECTED'
  | 'ROUND_STARTED'
  | 'SET_1_STARTED'
  | 'SET_2_STARTED'
  | 'TIME_EXPIRED'
  | 'SET_RESULT_SUBMITTED'
  | 'SUPER_TIEBREAK_REQUIRED'
  | 'CARD_REJECTED'
  | 'ROUND_COMPLETED'

export type CardDurationType = 'timed' | 'games' | 'instant' | 'until_condition' | 'point' | 'game' | 'set' | 'match'

export type TennisPoint = '0' | '15' | '30' | '40' | 'AD'

export type TeamSide = 'A' | 'B'

export type PlayerGender = 'woman' | 'man' | 'non_binary' | 'unspecified'

export type Player = {
  isTestData?: boolean
  id: string
  teamId: string
  firstName: string
  lastName: string
  name: string
  nickname: string
  gender: PlayerGender
  accessToken: string
}

export type GenderStartingScoreValue = 0 | 1 | 2

export type GenderStartingScore = {
  teamA: GenderStartingScoreValue
  teamB: GenderStartingScoreValue
}

export type Group = { id: string; name: string; tournamentId?: string; sortOrder?: number; assignedCourtId?: string | null }

export type Team = {
  isTestData?: boolean
  id: string
  name: string
  shortName: string
  color: string
  groupId: string
  ranking: number | null
  players: Player[]
}

export type MatchLineup = {
  teamId: string
  setNumber: number
  phase?: 'set_1' | 'set_2' | 'super_tiebreak'
  activePlayerIds: [string, string]
  benchPlayerId: string
  confirmedAt?: string
}

export type ScoreState = {
  points: Record<TeamSide, TennisPoint>
  games: Record<TeamSide, number>
  sets: Record<TeamSide, number>
  currentSet: number
}

export type CardDefinition = {
  id: string
  name: string
  slug: string
  description: string
  longDescription?: string | null
  category: 'bonus' | 'malus' | 'kaos'
  target: 'own_team' | 'opponent' | 'match' | 'global'
  activationTiming: 'before_point' | 'between_games' | 'set_break' | 'anytime'
  durationType: CardDurationType
  durationValue: number
  effectType: string
  targetType?: 'own_team' | 'opponent' | 'match' | 'round' | 'global' | 'active_card'
  canBeStolen?: boolean
  isGlobal: boolean
  enabled: boolean
  tournamentId?: string | null
  imageUrl?: string | null
  archivedAt?: string | null
  updatedAt?: string | null
}

export type TeamCard = {
  id: string
  teamId: string
  cardId: string
  state: CardState
  matchId?: string
  usedInSet?: 1 | 2
  activatedAt?: string
  expiresAt?: string
  remainingGames?: number
  stolenFromTeamId?: string
}

export type DiceRule = {
  id: string
  value: 1 | 2 | 3 | 4 | 5 | 6
  title: string
  description: string
  effectType: string
  durationGames?: number
  durationSeconds?: number
  productCode?: string
  enabled: boolean
}

export type MatchKaosEvent = {
  id: string
  matchId: string
  roundId?: string
  diceRuleId: string
  diceValue: number
  startedAt: string
  endsAt?: string
}

export type MatchEvent = {
  id: string
  matchId: string
  type: MatchEventType
  payload: Record<string, unknown>
  actorUserId: string
  createdAt: string
}

export type Match = {
  id: string
  roundId?: string
  courtId: string
  groupId: string
  teamAId: string
  teamBId: string
  status: MatchStatus
  score: ScoreState
  lineups: MatchLineup[]
  currentKaosEventId?: string
  activeCardUsageIds: string[]
  set1StartedAt?: string
  set1EndedAt?: string
  set2StartedAt?: string
  set2EndedAt?: string
  superTiebreakA?: number
  superTiebreakB?: number
  completedAt?: string
  resultConfirmedAt?: string
  resultConfirmedBy?: string
  activeSetDurationMinutes?: number
  set1ResultSubmittedAt?: string
  set2ResultSubmittedAt?: string
}

export type TournamentEvent = {
  id: string
  roundId?: string
  type: MatchEventType
  payload: Record<string, unknown>
  actorUserId: string
  createdAt: string
}

export type Round = {
  id: string
  tournamentId: string
  name: string
  stage: RoundStage
  sequence: number
  status: 'scheduled' | 'live_set_1' | 'set_break' | 'waiting_for_global_dice' | 'kaos_active' | 'live_set_2' | 'completed'
  diceResult?: 1 | 2 | 3 | 4 | 5 | 6
  diceRuleId?: string
  diceStartedAt?: string
  diceEndsAt?: string
  diceRolledAt?: string
  openedAt?: string
  setDurationMinutes?: number
  effectiveSetDurationMinutes?: number
  completionTotalMatches?: number
  completionCompletedMatches?: number
  completionReady?: boolean
  completionBlockers?: Array<{ matchId: string; courtId: string; reason: string }>
  cardsPerTeam?: number
  cardTotalTeams?: number
  cardReadyTeams?: number
  cardReadinessReady?: boolean
  cardReadinessBlockers?: Array<{ matchId: string; courtId: string; teamId: string; expectedCards: number; assignedCards: number }>
}

export type Court = {
  id: string
  name: string
}

export type Standing = {
  teamId: string
  played: number
  won: number
  lost: number
  points: number
}

export type GlobalEvent = {
  id: string
  type: 'prize' | 'challenge' | 'announcement'
  title: string
  description: string
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  prize?: string
  startedAt?: string
  completedAt?: string
  winnerPlayerId?: string
  winnerTeamId?: string
}

export type EventWinnerReport = { id:string; globalEventId:string; matchId:string; playerId:string; teamId:string; status:'pending'|'accepted'|'rejected'; createdAt:string }

export type Tournament = {
  id: string
  name: string
  /** Persisted setup values remain nullable for legacy/unconfigured tournaments. */
  teamsCount?: number | null
  teamsPerGroup?: number | null
  goldQualifiedCount?: number | null
  silverQualifiedCount?: number | null
  courtsCount?: number | null
  allowByes?: boolean | null
  themePreset?: 'white' | 'blue' | 'orange' | 'green' | 'custom' | null
  themeColor?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  phase?: TournamentPhase
  status?: 'draft' | 'configured' | 'live' | 'completed' | 'archived'
  setControlMode?: 'centralized' | 'referee'
  mainDisplayMode?: 'auto' | 'fixed'
  mainDisplayPage?: number
  mainDisplayIntervalSeconds?: 4 | 5 | 8 | 10
  refereeCanManageScore?: boolean
  refereeCanValidateCards?: boolean
  refereeCanReportEventWinner?: boolean
  cardsEnabled?: boolean
  displayCardNotificationsEnabled?: boolean
  diceEnabled?: boolean
  specialEventsEnabled?: boolean
  defaultSetDurationMinutes?: number
  groups: Group[]
  courts: Court[]
  rounds?: Round[]
  teams: Team[]
  matches: Match[]
  cards: CardDefinition[]
  teamCards: TeamCard[]
  diceRules: DiceRule[]
  kaosEvents: MatchKaosEvent[]
  matchEvents: MatchEvent[]
  tournamentEvents?: TournamentEvent[]
  globalEvents: GlobalEvent[]
  eventWinnerReports?: EventWinnerReport[]
  standings: Standing[]
}
