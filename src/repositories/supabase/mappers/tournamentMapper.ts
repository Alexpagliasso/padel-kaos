import type {
  CardDefinition,
  CardDurationType,
  CardState,
  DiceRule,
  GlobalEvent,
  Match,
  MatchEvent,
  MatchEventType,
  MatchLineup,
  MatchStatus,
  Player,
  PlayerGender,
  Round,
  RoundStage,
  Team,
  TeamCard,
  Tournament,
  TournamentPhase,
} from '../../../shared/types/domain'

export type SupabaseTournamentRow = {
  id: string
  name: string
  phase?: string | null
  status?: string | null
}

export type SupabaseGroupRow = {
  id: string
  name: string
}

export type SupabaseCourtRow = {
  id: string
  name: string
}

export type SupabaseTeamRow = {
  id: string
  name: string
  short_name: string
  color: string
  group_id: string | null
}

export type SupabasePlayerRow = {
  id: string
  team_id: string
  full_name: string
  nickname: string
  gender: string
}

export type SupabaseRoundRow = {
  id: string
  tournament_id: string
  name: string
  stage: string
  sequence: number
  status: string
  dice_result: number | null
  dice_rule_id: string | null
  dice_started_at: string | null
  dice_ends_at: string | null
}

export type SupabaseMatchRow = {
  id: string
  round_id: string
  group_id: string | null
  court_id: string
  team_a_id: string
  team_b_id: string
  status: string
  current_set: number
  games_a: number
  games_b: number
  sets_a: number
  sets_b: number
}

export type SupabaseMatchLineupRow = {
  match_id: string
  team_id: string
  set_number: number
  active_player_1_id: string
  active_player_2_id: string
  bench_player_id: string | null
}

export type SupabaseCardDefinitionRow = {
  id: string
  tournament_id: string | null
  name: string
  slug: string
  description: string
  effect_type: string
  target_type: string
  duration_type: string
  duration_value: number | null
  can_be_stolen: boolean | null
  enabled: boolean | null
}

export type SupabaseMatchCardRow = {
  id: string
  match_id: string
  team_id: string
  card_definition_id: string
  status: string
  used_in_set: number | null
  activated_at: string | null
  expires_at: string | null
  remaining_games: number | null
  stolen_from_team_id: string | null
}

export type SupabaseDiceRuleRow = {
  id: string
  dice_value: number
  title: string
  description: string
  effect_type: string
  duration_seconds: number
  enabled: boolean | null
}

export type SupabaseGlobalEventRow = {
  id: string
  type: string
  title: string
  description: string
  prize: string | null
  status: string
  started_at: string | null
  completed_at: string | null
  winner_player_id: string | null
  winner_team_id: string | null
}

export type SupabaseMatchEventRow = {
  id: string
  match_id: string
  type: string
  payload: Record<string, unknown> | null
  actor_user_id: string | null
  created_at: string
}

export type SupabaseTournamentStateDto = {
  tournament: SupabaseTournamentRow
  groups?: SupabaseGroupRow[] | null
  courts?: SupabaseCourtRow[] | null
  rounds?: SupabaseRoundRow[] | null
  teams?: SupabaseTeamRow[] | null
  players?: SupabasePlayerRow[] | null
  matches?: SupabaseMatchRow[] | null
  lineups?: SupabaseMatchLineupRow[] | null
  cards?: SupabaseCardDefinitionRow[] | null
  teamCards?: SupabaseMatchCardRow[] | null
  diceRules?: SupabaseDiceRuleRow[] | null
  matchEvents?: SupabaseMatchEventRow[] | null
  globalEvents?: SupabaseGlobalEventRow[] | null
}

export function createEmptyTournamentDomain(message = 'No tournament configured'): Tournament {
  return {
    id: 'empty-tournament',
    name: message,
    phase: 'GROUP_STAGE',
    status: 'draft',
    groups: [],
    courts: [],
    rounds: [],
    teams: [],
    matches: [],
    cards: [],
    teamCards: [],
    diceRules: [],
    kaosEvents: [],
    matchEvents: [],
    globalEvents: [],
    standings: [],
  }
}

export function mapSupabaseTournamentState(dto: SupabaseTournamentStateDto): Tournament {
  const players = dto.players ?? []
  const lineups = dto.lineups ?? []
  const teams = (dto.teams ?? []).map((team): Team => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    color: team.color,
    groupId: team.group_id ?? '',
    players: players.filter((player) => player.team_id === team.id).map(mapPlayer),
  }))

  const matches = (dto.matches ?? []).map((match): Match => ({
    id: match.id,
    roundId: match.round_id,
    courtId: match.court_id,
    groupId: match.group_id ?? '',
    teamAId: match.team_a_id,
    teamBId: match.team_b_id,
    status: mapMatchStatus(match.status),
    score: {
      currentSet: match.current_set,
      points: { A: '0', B: '0' },
      games: { A: match.games_a, B: match.games_b },
      sets: { A: match.sets_a, B: match.sets_b },
    },
    lineups: lineups.filter((lineup) => lineup.match_id === match.id).map(mapLineup),
    activeCardUsageIds: (dto.teamCards ?? [])
      .filter((card) => card.match_id === match.id && (card.status === 'pending' || card.status === 'active'))
      .map((card) => card.id),
  }))

  return {
    id: dto.tournament.id,
    name: dto.tournament.name,
    phase: mapTournamentPhase(dto.tournament.phase),
    status: mapTournamentStatus(dto.tournament.status),
    groups: (dto.groups ?? []).map((group) => ({ id: group.id, name: group.name })),
    courts: (dto.courts ?? []).map((court) => ({ id: court.id, name: court.name })),
    rounds: (dto.rounds ?? []).map(mapRound),
    teams,
    matches,
    cards: (dto.cards ?? []).map(mapCardDefinition),
    teamCards: (dto.teamCards ?? []).map(mapTeamCard),
    diceRules: (dto.diceRules ?? []).map(mapDiceRule),
    kaosEvents: [],
    matchEvents: (dto.matchEvents ?? []).map(mapMatchEvent),
    globalEvents: (dto.globalEvents ?? []).map(mapGlobalEvent),
    standings: teams.map((team) => ({ teamId: team.id, played: 0, won: 0, lost: 0, points: 0 })),
  }
}

function mapPlayer(player: SupabasePlayerRow): Player {
  return {
    id: player.id,
    name: player.full_name,
    nickname: player.nickname,
    gender: mapGender(player.gender),
    accessToken: '',
  }
}

function mapLineup(lineup: SupabaseMatchLineupRow): MatchLineup {
  return {
    teamId: lineup.team_id,
    setNumber: lineup.set_number,
    activePlayerIds: [lineup.active_player_1_id, lineup.active_player_2_id],
    benchPlayerId: lineup.bench_player_id ?? '',
  }
}

function mapRound(round: SupabaseRoundRow): Round {
  return {
    id: round.id,
    tournamentId: round.tournament_id,
    name: round.name,
    stage: mapRoundStage(round.stage),
    sequence: round.sequence,
    status: mapRoundStatus(round.status),
    diceResult: mapDiceValue(round.dice_result),
    diceRuleId: round.dice_rule_id ?? undefined,
    diceStartedAt: round.dice_started_at ?? undefined,
    diceEndsAt: round.dice_ends_at ?? undefined,
  }
}

function mapCardDefinition(card: SupabaseCardDefinitionRow): CardDefinition {
  return {
    id: card.id,
    name: card.name,
    slug: card.slug,
    description: card.description,
    category: card.target_type === 'global' || card.target_type === 'round' ? 'kaos' : 'bonus',
    target: mapCardTarget(card.target_type),
    activationTiming: 'anytime',
    durationType: mapCardDurationType(card.duration_type),
    durationValue: card.duration_value ?? 1,
    effectType: card.effect_type,
    targetType: mapCardTargetType(card.target_type),
    canBeStolen: card.can_be_stolen ?? false,
    isGlobal: card.tournament_id === null,
    enabled: card.enabled ?? true,
  }
}

function mapTeamCard(card: SupabaseMatchCardRow): TeamCard {
  const usedInSet = card.used_in_set === 1 || card.used_in_set === 2 ? card.used_in_set : undefined

  return {
    id: card.id,
    teamId: card.team_id,
    cardId: card.card_definition_id,
    matchId: card.match_id,
    state: mapCardState(card.status),
    usedInSet,
    activatedAt: card.activated_at ?? undefined,
    expiresAt: card.expires_at ?? undefined,
    remainingGames: card.remaining_games ?? undefined,
    stolenFromTeamId: card.stolen_from_team_id ?? undefined,
  }
}

function mapDiceRule(rule: SupabaseDiceRuleRow): DiceRule {
  return {
    id: rule.id,
    value: mapDiceValue(rule.dice_value) ?? 1,
    title: rule.title,
    description: rule.description,
    effectType: rule.effect_type,
    durationGames: Math.max(1, Math.ceil(rule.duration_seconds / 300)),
    enabled: rule.enabled ?? true,
  }
}

function mapMatchEvent(event: SupabaseMatchEventRow): MatchEvent {
  return {
    id: event.id,
    matchId: event.match_id,
    type: mapMatchEventType(event.type),
    payload: event.payload ?? {},
    actorUserId: event.actor_user_id ?? '',
    createdAt: event.created_at,
  }
}

function mapGlobalEvent(event: SupabaseGlobalEventRow): GlobalEvent {
  return {
    id: event.id,
    type: mapGlobalEventType(event.type),
    title: event.title,
    description: event.description,
    status: mapGlobalEventStatus(event.status),
    prize: event.prize ?? undefined,
    startedAt: event.started_at ?? undefined,
    completedAt: event.completed_at ?? undefined,
    winnerPlayerId: event.winner_player_id ?? undefined,
    winnerTeamId: event.winner_team_id ?? undefined,
  }
}

function mapTournamentPhase(phase: string | null | undefined): TournamentPhase {
  return phase === 'KNOCKOUT' ? 'KNOCKOUT' : 'GROUP_STAGE'
}

function mapTournamentStatus(status: string | null | undefined): Tournament['status'] {
  if (status === 'configured' || status === 'live' || status === 'completed' || status === 'archived') return status
  return 'draft'
}

function mapGender(gender: string): PlayerGender {
  if (gender === 'female') return 'woman'
  if (gender === 'male') return 'man'
  if (gender === 'non_binary') return 'non_binary'
  return 'unspecified'
}

function mapMatchStatus(status: string): MatchStatus {
  if (status === 'set_1') return 'live_set_1'
  if (status === 'waiting_global_dice') return 'kaos_pending'
  if (status === 'set_2' || status === 'super_tiebreak') return 'live_set_2'
  if (status === 'scheduled' || status === 'ready' || status === 'set_break' || status === 'completed') return status
  return 'scheduled'
}

function mapRoundStatus(status: string): Round['status'] {
  if (status === 'set_1') return 'live_set_1'
  if (status === 'waiting_global_dice') return 'waiting_for_global_dice'
  if (status === 'set_2') return 'live_set_2'
  if (status === 'kaos_active' || status === 'scheduled' || status === 'completed') return status
  return 'scheduled'
}

function mapRoundStage(stage: string): RoundStage {
  if (stage === 'quarter_final' || stage === 'semi_final' || stage === 'final') return stage
  return 'group'
}

function mapCardDurationType(durationType: string): CardDurationType {
  if (durationType === 'timed' || durationType === 'games' || durationType === 'instant' || durationType === 'until_condition') return durationType
  return 'instant'
}

function mapCardTarget(targetType: string): CardDefinition['target'] {
  if (targetType === 'opponent') return 'opponent'
  if (targetType === 'match') return 'match'
  if (targetType === 'round' || targetType === 'global') return 'global'
  return 'own_team'
}

function mapCardTargetType(targetType: string): CardDefinition['targetType'] {
  if (targetType === 'opponent' || targetType === 'match' || targetType === 'round' || targetType === 'global' || targetType === 'active_card') {
    return targetType
  }
  return 'own_team'
}

function mapCardState(status: string): CardState {
  if (status === 'available' || status === 'pending' || status === 'active' || status === 'used' || status === 'cancelled') return status
  return 'used'
}

function mapDiceValue(value: number | null): DiceRule['value'] | undefined {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) return value
  return undefined
}

function mapMatchEventType(type: string): MatchEventType {
  if (type === 'SET_ENDED') return 'SET_WON'
  if (type === 'MATCH_ENDED') return 'MATCH_COMPLETED'
  if (type === 'KAOS_STARTED') return 'KAOS_RULE_STARTED'
  if (type === 'KAOS_ENDED') return 'KAOS_RULE_ENDED'
  if (
    type === 'MATCH_STARTED' ||
    type === 'GAME_WON' ||
    type === 'CARD_PLAYED' ||
    type === 'CARD_ACTIVATED' ||
    type === 'CARD_EXPIRED' ||
    type === 'DICE_ROLLED' ||
    type === 'SCORE_CORRECTED'
  ) {
    return type
  }
  return 'SPECIAL_EVENT'
}

function mapGlobalEventType(type: string): GlobalEvent['type'] {
  if (type === 'challenge' || type === 'announcement') return type
  return 'prize'
}

function mapGlobalEventStatus(status: string): GlobalEvent['status'] {
  if (status === 'active' || status === 'completed' || status === 'cancelled') return status
  return 'draft'
}
