import type {
  GenderStartingScore,
  GenderStartingScoreValue,
  ScoreState,
  TeamSide,
  TennisPoint,
} from '../../shared/types/domain'

export type ScoreConfig = {
  goldenPoint?: boolean
  gamesToSet?: number
  gameStartingScore?: GenderStartingScore
  autoCompleteSet?: boolean
}

const pointOrder: TennisPoint[] = ['0', '15', '30', '40']

export function createInitialScore(config: ScoreConfig = {}): ScoreState {
  return {
    currentSet: 1,
    points: mapStartingScore(config.gameStartingScore),
    games: { A: 0, B: 0 },
    sets: { A: 0, B: 0 },
  }
}

export function createGameState(teamABonus: GenderStartingScoreValue, teamBBonus: GenderStartingScoreValue) {
  return mapStartingScore({ teamA: teamABonus, teamB: teamBBonus })
}

export function startNewGame(state: ScoreState, config: ScoreConfig = {}): ScoreState {
  return {
    currentSet: state.currentSet,
    points: mapStartingScore(config.gameStartingScore),
    games: { ...state.games },
    sets: { ...state.sets },
  }
}

export function scorePoint(
  state: ScoreState,
  winner: TeamSide,
  config: ScoreConfig = {},
): { score: ScoreState; events: string[] } {
  const loser: TeamSide = winner === 'A' ? 'B' : 'A'
  const next: ScoreState = {
    currentSet: state.currentSet,
    points: { ...state.points },
    games: { ...state.games },
    sets: { ...state.sets },
  }
  const events: string[] = ['POINT_SCORED']

  if (config.goldenPoint && next.points.A === '40' && next.points.B === '40') {
    winGame(next, winner, config)
    events.push('GAME_WON')
    return { score: next, events }
  }

  if (next.points[winner] === 'AD') {
    winGame(next, winner, config)
    events.push('GAME_WON')
    return { score: next, events }
  }

  if (next.points[winner] === '40' && next.points[loser] === 'AD') {
    next.points[loser] = '40'
    return { score: next, events }
  }

  if (next.points[winner] === '40' && next.points[loser] === '40') {
    next.points[winner] = 'AD'
    return { score: next, events }
  }

  if (next.points[winner] === '40') {
    winGame(next, winner, config)
    events.push('GAME_WON')
    return { score: next, events }
  }

  const pointIndex = pointOrder.indexOf(next.points[winner])
  next.points[winner] = pointOrder[Math.min(pointIndex + 1, pointOrder.length - 1)]
  return { score: next, events }
}

function winGame(state: ScoreState, winner: TeamSide, config: ScoreConfig) {
  state.games[winner] += 1
  state.points = mapStartingScore(config.gameStartingScore)

  const gamesToSet = config.gamesToSet ?? 6
  const loser: TeamSide = winner === 'A' ? 'B' : 'A'
  if (
    config.autoCompleteSet
    && state.games[winner] >= gamesToSet
    && state.games[winner] - state.games[loser] >= 2
  ) {
    state.sets[winner] += 1
    state.games = { A: 0, B: 0 }
    state.currentSet += 1
  }
}

export function formatPoint(point: TennisPoint) {
  return point === 'AD' ? 'ADV' : point
}

function mapStartingScore(startingScore?: GenderStartingScore): Record<TeamSide, TennisPoint> {
  return {
    A: mapStartingScoreValue(startingScore?.teamA ?? 0),
    B: mapStartingScoreValue(startingScore?.teamB ?? 0),
  }
}

function mapStartingScoreValue(value: GenderStartingScoreValue): TennisPoint {
  if (value === 2) return '30'
  if (value === 1) return '15'
  return '0'
}
