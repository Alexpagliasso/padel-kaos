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
  | 'completed'

export type TournamentPhase = 'GROUP_STAGE' | 'KNOCKOUT'

export type RoundStage = 'group' | 'quarter_final' | 'semi_final' | 'final'

export type CardState = 'available' | 'pending' | 'active' | 'used' | 'cancelled'

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

export type CardDurationType = 'timed' | 'games' | 'instant' | 'until_condition' | 'point' | 'game' | 'set' | 'match'

export type TennisPoint = '0' | '15' | '30' | '40' | 'AD'

export type TeamSide = 'A' | 'B'

export type PlayerGender = 'woman' | 'man' | 'non_binary' | 'unspecified'

export type Player = {
  id: string
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

export type Team = {
  id: string
  name: string
  shortName: string
  color: string
  groupId: string
  players: Player[]
}

export type MatchLineup = {
  teamId: string
  setNumber: number
  activePlayerIds: [string, string]
  benchPlayerId: string
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
}

export type Round = {
  id: string
  tournamentId: string
  name: string
  stage: RoundStage
  sequence: number
  status: 'scheduled' | 'live_set_1' | 'waiting_for_global_dice' | 'kaos_active' | 'live_set_2' | 'completed'
  diceResult?: 1 | 2 | 3 | 4 | 5 | 6
  diceRuleId?: string
  diceStartedAt?: string
  diceEndsAt?: string
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

export type Tournament = {
  id: string
  name: string
  phase?: TournamentPhase
  status?: 'draft' | 'configured' | 'live' | 'completed' | 'archived'
  groups: { id: string; name: string }[]
  courts: Court[]
  rounds?: Round[]
  teams: Team[]
  matches: Match[]
  cards: CardDefinition[]
  teamCards: TeamCard[]
  diceRules: DiceRule[]
  kaosEvents: MatchKaosEvent[]
  matchEvents: MatchEvent[]
  globalEvents: GlobalEvent[]
  standings: Standing[]
}
