import type { DiceRule, TeamSide, Tournament } from '../../shared/types/domain'
import type { CreateMatchInput, CreateTeamInput, DemoEvent } from '../../demo/demoTypes'

export type DataProvider = 'demo' | 'supabase'

export type TournamentRepositoryContract = {
  data: Tournament
  isLoading?: boolean
  error?: string
}

export type MatchRepositoryContract = {
  selectedMatchId: string
  selectedCourtId: string
  selectMatch: (matchId: string) => void
  selectCourt: (courtId: string) => void
  createMatch: (input: CreateMatchInput) => void
  drawMatchCards: (matchId: string) => void
  startMatch: (matchId: string) => void
  endSet: (matchId: string) => void
  startSecondSet: (matchId: string) => void
  endMatch: (matchId: string) => void
  resetMatch: (matchId: string) => void
  scorePoint: (matchId: string, winner: TeamSide) => void
  rollKaosDice: (matchId: string) => DiceRule | undefined
}

export type EventRepositoryContract = {
  events: DemoEvent[]
  clearEvents: () => void
  activatePorTres: (prize: string) => void
  registerPorTres: (matchId: string, playerId: string) => { ok: boolean; message: string }
  porTresPrizeDraft: string
  setPorTresPrizeDraft: (prize: string) => void
}

export type TeamRepositoryContract = {
  createTeam: (input: CreateTeamInput) => void
}
