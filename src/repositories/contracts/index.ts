import type { CardDefinition, CardDurationType, DiceRule, TeamSide, Tournament } from '../../shared/types/domain'
import type { PresetId } from '../../theme/tournamentPresets'
import type { CreateMatchInput, CreateTeamInput, DemoEvent } from '../../demo/demoTypes'

export type DataProvider = 'demo' | 'supabase'

export type TournamentRepositoryContract = {
  data: Tournament
  tournaments?: Tournament[]
  selectedTournamentId?: string | null
  selectTournament?: (tournamentId: string | null) => void
  createTournament?: (name: string) => Promise<Tournament>
  updateTournamentConfiguration?: (tournamentId: string, input: TournamentConfigurationInput) => Promise<Tournament>
  deleteTournamentIfSafe?: (tournamentId: string) => Promise<void>
  isLoading?: boolean
  isCreating?: boolean
  isSaving?: boolean
  error?: string
}

export type TournamentConfigurationInput = {
  name: string
  teamsCount: number
  teamsPerGroup: number
  goldQualifiedCount: number
  silverQualifiedCount: number
  courtsCount: number
  allowByes: boolean
  themePreset: PresetId
  themeColor: string | null
}

export type TournamentAdminRepositoryContract = {
  listTournaments: () => Promise<Tournament[]>
  getTournament: (tournamentId: string) => Promise<Tournament>
  createTournament: (name: string) => Promise<Tournament>
  updateTournamentConfiguration: (tournamentId: string, input: TournamentConfigurationInput) => Promise<Tournament>
  deleteTournamentIfSafe: (tournamentId: string) => Promise<void>
}

export type CardDefinitionInput = {
  name: string
  slug: string
  description: string
  longDescription: string
  imageUrl: string | null
  effectType: string
  targetType: NonNullable<CardDefinition['targetType']>
  durationType: CardDurationType
  durationValue: number | null
  canBeStolen: boolean
  enabled: boolean
}

export type TournamentCard = {
  definition: CardDefinition
  activeInTournament: boolean
}

export type CardAdminRepositoryContract = {
  listCardDefinitions: () => Promise<CardDefinition[]>
  createCardDefinition: (input: CardDefinitionInput) => Promise<CardDefinition>
  updateCardDefinition: (cardId: string, input: CardDefinitionInput) => Promise<CardDefinition>
  archiveCardDefinition: (cardId: string) => Promise<CardDefinition>
  listTournamentCards: (tournamentId: string) => Promise<TournamentCard[]>
  setTournamentCardEnabled: (tournamentId: string, cardId: string, enabled: boolean) => Promise<void>
  uploadCardImage: (cardId: string, file: File) => Promise<string>
  removeCardImage: (cardId: string, imageUrl: string) => Promise<void>
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
  createTeam: (input: CreateTeamInput & { tournamentId?: string }) => Promise<string> | string
  updateTeam: (teamId: string, input: CreateTeamInput & { tournamentId?: string }) => Promise<string> | string
  setTeamRanking?: (tournamentId: string, teamId: string, ranking: number | null) => Promise<void> | void
  assignRandomTeamRankings?: (tournamentId: string) => Promise<void> | void
}
