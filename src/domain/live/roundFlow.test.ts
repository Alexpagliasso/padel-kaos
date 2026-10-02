import { describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import type { Match, Round, Tournament } from '../../shared/types/domain'
import { canConfigureSet2Lineup, canConfirmSet1, canGenerateBrackets, canRollDice, canStartSet2, canSubmitSet2Result, getRoundFlow, needsTiebreak } from './roundFlow'

function fixture(): { tournament: Tournament; round: Round; matches: Match[] } {
  const tournament = createDemoTournament()
  const round: Round = { id: 'round-flow', tournamentId: tournament.id, name: 'Turno 1', stage: 'group', sequence: 1, status: 'live_set_1', cardReadinessReady: true }
  const source = tournament.matches[0]
  const matches = Array.from({ length: 3 }, (_, index): Match => ({ ...source, score: { ...source.score, points: { ...source.score.points }, games: { ...source.score.games }, sets: { ...source.score.sets } }, id: `match-${index}`, roundId: round.id, status: 'set_break', set1StartedAt: '2026-10-01T10:00:00Z', set1EndedAt: '2026-10-01T10:15:00Z', set1ResultSubmittedAt: '2026-10-01T10:16:00Z', lineups: [
    { teamId: source.teamAId, setNumber: 1, activePlayerIds: ['a','b'], benchPlayerId: 'c' }, { teamId: source.teamBId, setNumber: 1, activePlayerIds: ['d','e'], benchPlayerId: 'f' },
  ] }))
  tournament.rounds = [round]; tournament.matches = matches; tournament.cardsEnabled = false; tournament.diceEnabled = true
  tournament.matchEvents = matches.map(match => ({ id: `event-${match.id}`, matchId: match.id, type: 'SET_WON', actorUserId: 'ref', createdAt: '2026-10-01', payload: { set_number: 1, games_a: 6, games_b: 4 } }))
  return { tournament, round, matches }
}

describe('round global flow guards', () => {
  it('keeps the whole round in Set 1 when only 2 of 3 results are complete', () => {
    const { tournament, round, matches } = fixture(); matches[2].set1EndedAt = undefined; matches[2].set1ResultSubmittedAt = undefined; tournament.matchEvents = tournament.matchEvents.slice(0, 2)
    const flow = getRoundFlow(tournament, round)
    expect(flow).toMatchObject({ phase: 'results_set_1', completed: 2, total: 3, waiting: 1 })
    expect(canRollDice(flow, round)).toBe(false); expect(canConfigureSet2Lineup(flow)).toBe(false); expect(canStartSet2(flow)).toBe(false); expect(canSubmitSet2Result(flow, matches[0])).toBe(false)
  })
  it('offers the dice once all Set 1 results are submitted and never after a roll', () => {
    const { tournament, round } = fixture(); const ready = getRoundFlow(tournament, round)
    expect(ready.phase).toBe('dice'); expect(canRollDice(ready, round)).toBe(true)
    round.diceResult = 2; round.diceRuleId = 'dice-2'; expect(canRollDice(getRoundFlow(tournament, round), round)).toBe(false)
  })
  it('requires Regia confirmation when all courts submitted but remain in Set 1',()=>{const{tournament,round,matches}=fixture();matches.forEach(match=>{match.status='live_set_1'});const flow=getRoundFlow(tournament,round);expect(flow).toMatchObject({phase:'confirm_set_1',completed:3,waiting:0});expect(canConfirmSet1(flow)).toBe(true);expect(canRollDice(flow,round)).toBe(false)})
  it('unlocks only Set 2 lineups after the dice', () => { const { tournament, round } = fixture(); round.diceResult = 1; expect(getRoundFlow(tournament, round).phase).toBe('lineups_set_2') })
  it('skips dice when disabled and reaches Set 2 ready then live',()=>{
    const{tournament,round,matches}=fixture();tournament.diceEnabled=false
    expect(getRoundFlow(tournament,round).phase).toBe('lineups_set_2')
    matches.forEach(match=>match.lineups.push(
      {teamId:match.teamAId,setNumber:2,activePlayerIds:['a','c'],benchPlayerId:'b'},
      {teamId:match.teamBId,setNumber:2,activePlayerIds:['d','f'],benchPlayerId:'e'},
    ))
    expect(getRoundFlow(tournament,round).phase).toBe('set_2_ready')
    matches.forEach(match=>{match.status='live_set_2';match.set2StartedAt='2026-10-01T10:20:00Z'})
    expect(getRoundFlow(tournament,round).phase).toBe('set_2_live')
  })
  it('derives submitted Set 2 confirmation and mixed completion/tie-break phases',()=>{
    const{tournament,round,matches}=fixture();round.diceResult=1
    matches.forEach((match,index)=>{match.lineups.push(
      {teamId:match.teamAId,setNumber:2,activePlayerIds:['a','c'],benchPlayerId:'b'},
      {teamId:match.teamBId,setNumber:2,activePlayerIds:['d','f'],benchPlayerId:'e'},
    );match.status='live_set_2';match.set2StartedAt='2026-10-01T10:20:00Z';match.set2EndedAt='2026-10-01T10:35:00Z';match.set2ResultSubmittedAt='2026-10-01T10:36:00Z';match.score.sets=index===1?{A:1,B:1}:{A:2,B:0}})
    tournament.matchEvents.push(...matches.map(match=>({id:`s2-${match.id}`,matchId:match.id,type:'SET_WON' as const,actorUserId:'ref',createdAt:'2026-10-01',payload:{set_number:2,games_a:6,games_b:3}})))
    expect(getRoundFlow(tournament,round).phase).toBe('confirm_set_2')
    matches.forEach((match,index)=>{match.status=index===1?'super_tiebreak':'completed';if(index!==1)match.resultConfirmedAt='2026-10-01T10:37:00Z'})
    expect(getRoundFlow(tournament,round)).toMatchObject({phase:'tiebreak_lineups',matches:[expect.objectContaining({id:'match-1'})]})
  })
  it('distinguishes required and unnecessary tie-breaks', () => { const { matches } = fixture(); matches[0].status = 'super_tiebreak'; matches[0].score.sets = { A: 1, B: 1 }; expect(needsTiebreak(matches[0])).toBe(true); matches[1].score.sets = { A: 2, B: 0 }; expect(needsTiebreak(matches[1])).toBe(false) })
  it('allows brackets only after every group round is completed', () => { const { round } = fixture(); expect(canGenerateBrackets([round])).toBe(false); round.status = 'completed'; expect(canGenerateBrackets([round])).toBe(true) })
})
