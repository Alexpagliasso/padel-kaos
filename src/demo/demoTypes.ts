import type {
  CardState,
  DiceRule,
  GenderStartingScore,
  TeamSide,
  Tournament,
} from '../shared/types/domain'

export type DemoEventType =
  | 'MATCH_STARTED'
  | 'POINT_SCORED'
  | 'GAME_WON'
  | 'SET_WON'
  | 'CARD_PLAYED'
  | 'CARD_ACKNOWLEDGED'
  | 'CARD_ACTIVATED'
  | 'CARD_CONSUMED'
  | 'DICE_ROLLED'
  | 'KAOS_RULE_STARTED'
  | 'GLOBAL_EVENT_STARTED'
  | 'POR_TRES_RECORDED'
  | 'GLOBAL_EVENT_WON'
  | 'MATCH_RESET'
  | 'DEMO_RESET'
  | 'MATCH_COMPLETED'
  | 'MATCH_CARDS_DRAWN'

export type DemoEvent = {
  id: string
  type: DemoEventType
  matchId?: string
  teamId?: string
  playerId?: string
  cardId?: string
  payload: Record<string, unknown>
  createdAt: string
}

export type DemoCardAssignment = {
  id: string
  teamId: string
  cardId: string
  state: CardState
  matchId?: string
  acknowledgedAt?: string
}

export type DemoRepositoryResult<T> = {
  data: T
}

export type DemoState = {
  savedWorkspaces?: Record<string, import('../features/admin/workspace/workspaceStore').WorkspaceEntry>
  savedEvents?: Record<string, DemoEvent[]>
  savedSelections?: Record<string, { selectedTeamId: string; selectedMatchId: string; selectedCourtId: string; porTresPrizeDraft: string }>
  tournament: Tournament
  events: DemoEvent[]
  selectedTeamId: string
  selectedMatchId: string
  selectedCourtId: string
  porTresPrizeDraft: string
}

export type DemoActions = {
  resetDemo: () => void
  loadDemoScenario: () => void
  clearEvents: () => void
  resetScores: () => void
  resetCards: () => void
  selectTeam: (teamId: string) => void
  selectMatch: (matchId: string) => void
  selectCourt: (courtId: string) => void
  setPorTresPrizeDraft: (prize: string) => void
  createTeam: (input: CreateTeamInput) => string
  updateTeam: (teamId: string, input: CreateTeamInput) => string
  setTeamRanking: (tournamentId: string, teamId: string, ranking: number | null) => void
  assignRandomTeamRankings: (tournamentId: string) => void
  createMatch: (input: CreateMatchInput) => void
  confirmLineup: (matchId: string, teamId: string, setNumber: 1 | 2, playerIds: [string, string]) => void
  assignCard: (teamId: string, cardId: string, matchId?: string) => void
  drawMatchCards: (matchId: string) => void
  startMatch: (matchId: string) => void
  endSet: (matchId: string) => void
  startSecondSet: (matchId: string) => void
  endMatch: (matchId: string) => void
  resetMatch: (matchId: string) => void
  playCard: (teamCardId: string) => { ok: boolean; message: string }
  acknowledgeCard: (teamCardId: string) => { ok: boolean; message: string }
  scorePoint: (matchId: string, winner: TeamSide) => void
  rollKaosDice: (matchId: string) => DiceRule | undefined
  activatePorTres: (prize: string) => void
  registerPorTres: (matchId: string, playerId: string) => { ok: boolean; message: string }
}

export type DemoStore = DemoState & DemoActions

export type CreateTeamInput = {
  name: string
  color: string
  players: Array<{
    id?: string
    firstName: string
    lastName: string
    gender: 'male' | 'female'
  }>
}

export type CreateMatchInput = {
  teamAId: string
  teamBId: string
  courtId: string
  groupId?: string
  teamAActivePlayerIds: [string, string]
  teamBActivePlayerIds: [string, string]
}

export type ActiveGameContext = {
  startingScore: GenderStartingScore
  teamAWomenCount: number
  teamBWomenCount: number
}

export type DemoCommandResult = {
  ok: boolean
  message: string
}
