import { useDemoStore } from '../../demo/demoStore'
import type {
  EventRepositoryContract,
  MatchRepositoryContract,
  TeamRepositoryContract,
  TournamentRepositoryContract,
} from '../contracts'

export function useDemoTournamentRepository(): TournamentRepositoryContract {
  const tournament = useDemoStore((state) => state.tournament)
  return { data: tournament }
}

export function useDemoMatchRepository(): MatchRepositoryContract {
  return {
    selectedMatchId: useDemoStore((state) => state.selectedMatchId),
    selectedCourtId: useDemoStore((state) => state.selectedCourtId),
    selectMatch: useDemoStore((state) => state.selectMatch),
    selectCourt: useDemoStore((state) => state.selectCourt),
    createMatch: useDemoStore((state) => state.createMatch),
    drawMatchCards: useDemoStore((state) => state.drawMatchCards),
    startMatch: useDemoStore((state) => state.startMatch),
    endSet: useDemoStore((state) => state.endSet),
    startSecondSet: useDemoStore((state) => state.startSecondSet),
    endMatch: useDemoStore((state) => state.endMatch),
    resetMatch: useDemoStore((state) => state.resetMatch),
    scorePoint: useDemoStore((state) => state.scorePoint),
    rollKaosDice: useDemoStore((state) => state.rollKaosDice),
  }
}

export function useDemoEventRepository(): EventRepositoryContract {
  return {
    events: useDemoStore((state) => state.events),
    clearEvents: useDemoStore((state) => state.clearEvents),
    activatePorTres: useDemoStore((state) => state.activatePorTres),
    registerPorTres: useDemoStore((state) => state.registerPorTres),
    porTresPrizeDraft: useDemoStore((state) => state.porTresPrizeDraft),
    setPorTresPrizeDraft: useDemoStore((state) => state.setPorTresPrizeDraft),
  }
}

export function useDemoTeamRepository(): TeamRepositoryContract {
  return {
    createTeam: useDemoStore((state) => state.createTeam),
    updateTeam: useDemoStore((state) => state.updateTeam),
    setTeamRanking: useDemoStore((state) => state.setTeamRanking),
    assignRandomTeamRankings: useDemoStore((state) => state.assignRandomTeamRankings),
  }
}
