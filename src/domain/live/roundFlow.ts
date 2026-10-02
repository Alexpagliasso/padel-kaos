import type { Match, Round, Tournament } from '../../shared/types/domain'
import { getPersistedSetResult } from './readiness'

export type RoundFlowPhase =
  | 'cards' | 'lineups_set_1' | 'set_1_ready' | 'set_1_live' | 'results_set_1'
  | 'confirm_set_1' | 'dice' | 'lineups_set_2' | 'set_2_ready' | 'set_2_live' | 'results_set_2' | 'confirm_set_2'
  | 'tiebreak_lineups' | 'tiebreak_live' | 'round_complete'

export type RoundFlow = {
  phase: RoundFlowPhase
  matches: Match[]
  completed: number
  total: number
  waiting: number
  setNumber?: 1 | 2 | 3
}

const hasLineup = (match: Match, teamId: string, setNumber: number) => match.lineups.some(lineup => lineup.teamId === teamId && lineup.setNumber === setNumber)
const lineupsReady = (matches: Match[], setNumber: number) => matches.every(match => hasLineup(match, match.teamAId, setNumber) && hasLineup(match, match.teamBId, setNumber))
const resultReady = (tournament: Tournament, match: Match, setNumber: 1 | 2) => Boolean(getPersistedSetResult(tournament, match.id, setNumber)) && Boolean(setNumber === 1 ? match.set1ResultSubmittedAt : match.set2ResultSubmittedAt)

export function getRoundFlow(tournament: Tournament, round?: Round): RoundFlow {
  const matches = round ? tournament.matches.filter(match => match.roundId === round.id) : []
  const base = { matches, total: matches.length }
  if (!matches.length) return { ...base, phase: 'cards', completed: 0, waiting: 0 }
  if (tournament.cardsEnabled !== false && !round?.cardReadinessReady) return { ...base, phase: 'cards', completed: round?.cardReadyTeams ?? 0, waiting: Math.max(0, (round?.cardTotalTeams ?? matches.length * 2) - (round?.cardReadyTeams ?? 0)) }
  const set1Lineups = matches.reduce((sum, match) => sum + [match.teamAId, match.teamBId].filter(teamId => hasLineup(match, teamId, 1)).length, 0)
  if (!lineupsReady(matches, 1)) return { ...base, phase: 'lineups_set_1', setNumber: 1, completed: set1Lineups, waiting: matches.length * 2 - set1Lineups }
  if (matches.every(match => !match.set1StartedAt)) return { ...base, phase: 'set_1_ready', setNumber: 1, completed: 0, waiting: matches.length }
  const set1Results = matches.filter(match => resultReady(tournament, match, 1)).length
  if (set1Results < matches.length) {
    const ended = matches.filter(match => match.set1EndedAt).length
    return { ...base, phase: ended ? 'results_set_1' : 'set_1_live', setNumber: 1, completed: set1Results, waiting: matches.length - set1Results }
  }
  if(matches.some(match=>match.status==='live_set_1'))return{...base,phase:'confirm_set_1',setNumber:1,completed:matches.length,waiting:0}
  if (tournament.diceEnabled !== false && !round?.diceResult) return { ...base, phase: 'dice', completed: matches.length, waiting: 0 }
  const set2Lineups = matches.reduce((sum, match) => sum + [match.teamAId, match.teamBId].filter(teamId => hasLineup(match, teamId, 2)).length, 0)
  if (!lineupsReady(matches, 2)) return { ...base, phase: 'lineups_set_2', setNumber: 2, completed: set2Lineups, waiting: matches.length * 2 - set2Lineups }
  if (matches.every(match => !match.set2StartedAt)) return { ...base, phase: 'set_2_ready', setNumber: 2, completed: 0, waiting: matches.length }
  const set2Results = matches.filter(match => resultReady(tournament, match, 2)).length
  if (set2Results < matches.length) {
    const ended = matches.filter(match => match.set2EndedAt).length
    return { ...base, phase: ended ? 'results_set_2' : 'set_2_live', setNumber: 2, completed: set2Results, waiting: matches.length - set2Results }
  }
  if(matches.some(match=>match.status==='live_set_2'))return{...base,phase:'confirm_set_2',setNumber:2,completed:matches.length,waiting:0}
  const tiebreaks = matches.filter(needsTiebreak)
  if (!tiebreaks.length) return { ...base, phase: 'round_complete', completed: matches.filter(match => match.resultConfirmedAt || match.status === 'completed').length, waiting: matches.filter(match => !match.resultConfirmedAt && match.status !== 'completed').length }
  const tiebreakLineups = lineupsReady(tiebreaks, 3)
  if (!tiebreakLineups) return { ...base, matches: tiebreaks, phase: 'tiebreak_lineups', setNumber: 3, completed: 0, waiting: tiebreaks.length * 2 }
  return { ...base, matches: tiebreaks, phase: 'tiebreak_live', setNumber: 3, completed: tiebreaks.filter(match => validTiebreakScore(match)).length, waiting: tiebreaks.filter(match => !validTiebreakScore(match)).length }
}

export const canStartSet1 = (flow: RoundFlow) => flow.phase === 'set_1_ready'
export const canSubmitSet1Result = (flow: RoundFlow, match: Match) => flow.phase === 'results_set_1' && Boolean(match.set1EndedAt) && !match.set1ResultSubmittedAt
export const canRollDice = (flow: RoundFlow, round?: Round) => flow.phase === 'dice' && !round?.diceResult
export const canConfirmSet1 = (flow:RoundFlow)=>flow.phase==='confirm_set_1'
export const canConfirmSet2 = (flow:RoundFlow)=>flow.phase==='confirm_set_2'
export const canConfigureSet2Lineup = (flow: RoundFlow) => flow.phase === 'lineups_set_2'
export const canStartSet2 = (flow: RoundFlow) => flow.phase === 'set_2_ready'
export const canSubmitSet2Result = (flow: RoundFlow, match: Match) => flow.phase === 'results_set_2' && Boolean(match.set2EndedAt) && !match.set2ResultSubmittedAt
export const needsTiebreak = (match: Match) => match.status === 'super_tiebreak' || match.score.sets.A === match.score.sets.B
export const canSubmitTiebreak = (flow: RoundFlow, match: Match) => flow.phase === 'tiebreak_live' && needsTiebreak(match)
export const canCloseRound = (flow: RoundFlow) => flow.phase === 'round_complete' && flow.waiting === 0
export const canGenerateBrackets = (rounds: Round[] = []) => rounds.length > 0 && rounds.every(round => round.stage !== 'group' || round.status === 'completed')

export const roundFlowLabel: Record<RoundFlowPhase, string> = {
  cards: 'Preparazione carte', lineups_set_1: 'Formazioni primo set', set_1_ready: 'Primo set pronto', set_1_live: 'Primo set live',
  results_set_1: 'Risultati primo set',confirm_set_1:'Primo set da confermare', dice: 'Dado globale', lineups_set_2: 'Formazioni secondo set', set_2_ready: 'Secondo set pronto',
  set_2_live: 'Secondo set live', results_set_2: 'Risultati secondo set',confirm_set_2:'Secondo set da confermare', tiebreak_lineups: 'Formazioni tie-break',
  tiebreak_live: 'Tie-break live', round_complete: 'Turno completo',
}

function validTiebreakScore(match: Match) { return match.superTiebreakA != null && match.superTiebreakB != null && match.superTiebreakA !== match.superTiebreakB }
