import type { GlobalEvent, Match, Round, Tournament } from '../../../shared/types/domain'
import { getRoundFlow, roundFlowLabel } from '../../../domain/live/roundFlow'

export function getControlRoomRound(tournament: Tournament): Round | undefined {
  const rounds=[...(tournament.rounds??[])].sort((a,b)=>a.sequence-b.sequence)
  return rounds.find((round) => round.status !== 'completed') ?? rounds.at(-1)
}

export function getCurrentRoundMatches(tournament: Tournament, round?: Round): Match[] {
  if (!round) return tournament.matches
  return tournament.matches.filter((match) => match.roundId === round.id)
}

export function getGlobalKaosStatus(round?: Round): 'NOT STARTED' | 'WAITING' | 'ACTIVE' | 'COMPLETED' {
  if (!round) return 'NOT STARTED'
  if (round.status === 'completed') return 'COMPLETED'
  if (round.status === 'waiting_for_global_dice') return 'WAITING'
  if (round.status === 'kaos_active' || round.diceResult) return 'ACTIVE'
  return 'NOT STARTED'
}

export function getPorTresEvent(tournament: Tournament): GlobalEvent | undefined {
  return tournament.globalEvents.find((event) => event.type === 'challenge' || event.title.toUpperCase().includes('POR TRES'))
}

export function getOperationalAttention(tournament:Tournament,round?:Round){
  const matches=getCurrentRoundMatches(tournament,round)
  const items:Array<{id:string;message:string}>=[]
  for(const match of matches){
    const court=tournament.courts.find(item=>item.id===match.courtId)?.name??'Campo'
    if(match.status==='super_tiebreak'&&!match.resultConfirmedAt)items.push({id:`stb:${match.id}`,message:`${court} — Super Tie-Break necessario`})
    if(match.set1EndedAt&&!match.set1ResultSubmittedAt)items.push({id:`set1:${match.id}`,message:`${court} — Risultato Set 1 da inviare`})
    if(match.set2EndedAt&&!match.set2ResultSubmittedAt)items.push({id:`set2:${match.id}`,message:`${court} — Risultato Set 2 da inviare`})
    const pending=tournament.teamCards.filter(card=>card.matchId===match.id&&card.state==='pending').length
    if(pending)items.push({id:`cards:${match.id}`,message:`${court} — ${pending} ${pending===1?'carta in attesa':'carte in attesa'}`})
  }
  return items
}

export type ControlRoomMode='preparation'|'live'

export function getControlRoomMode(matches:Match[]):ControlRoomMode{
  return matches.some(match=>!['scheduled','ready'].includes(match.status))?'live':'preparation'
}

export function getRoundReadiness(tournament:Tournament,round?:Round,refereeCourtIds:string[]=[]){
  const matches=getCurrentRoundMatches(tournament,round)
  const lineupTargets=matches.length*2
  const lineupsReady=matches.reduce((total,match)=>total+[match.teamAId,match.teamBId].filter(teamId=>match.lineups.some(lineup=>lineup.teamId===teamId&&lineup.setNumber===1)).length,0)
  const coveredCourts=matches.filter(match=>refereeCourtIds.includes(match.courtId)).length
  const cardsReady=tournament.cardsEnabled===false||Boolean(round?.cardReadinessReady)
  return{matches:matches.length,lineupTargets,lineupsReady,missingLineups:Math.max(0,lineupTargets-lineupsReady),coveredCourts,cardsReady,ready:matches.length>0&&lineupsReady===lineupTargets&&cardsReady}
}

export function getNextControlRoomAction(tournament:Tournament,round?:Round,refereeCourtIds:string[]=[]){
  const readiness=getRoundReadiness(tournament,round,refereeCourtIds)
  if(!round||!readiness.matches)return{mode:'preparation' as const,label:'Crea calendario e turno',target:'schedule' as const}
  const flow=getRoundFlow(tournament,round)
  if(flow.phase==='results_set_1'||flow.phase==='results_set_2')return{mode:'live' as const,label:flow.waiting?`Attendi ${flow.waiting} ${flow.waiting===1?'campo':'campi'}`:`Conferma ${roundFlowLabel[flow.phase]}`,target:'results' as const}
  if(flow.phase==='confirm_set_1')return{mode:'live' as const,label:'Conferma primo set e passa al dado',target:'results' as const}
  if(flow.phase==='confirm_set_2')return{mode:'live' as const,label:'Conferma secondo set',target:'results' as const}
  if(flow.phase==='dice')return{mode:'live' as const,label:'Lancia il dado globale',target:'effects' as const}
  if(flow.phase==='lineups_set_2')return{mode:'live' as const,label:`Completa ${flow.waiting} formazioni Set 2`,target:'lineups' as const}
  if(flow.phase==='set_2_ready')return{mode:'live' as const,label:'Avvia il secondo set',target:'fields' as const}
  if(flow.phase==='round_complete')return{mode:'live' as const,label:'Chiudi e avanza il turno',target:'results' as const}
  if(getControlRoomMode(getCurrentRoundMatches(tournament,round))==='live'){
    const incomplete=getCurrentRoundMatches(tournament,round).filter(match=>match.status!=='completed').length
    return incomplete?{mode:'live' as const,label:`Segui ${incomplete} partite in corso`,target:'fields' as const}:{mode:'live' as const,label:'Completa e avanza il turno',target:'results' as const}
  }
  if(readiness.missingLineups)return{mode:'preparation' as const,label:`Completa ${readiness.missingLineups} formazioni`,target:'lineups' as const}
  if(!readiness.cardsReady)return{mode:'preparation' as const,label:'Assegna le carte del turno',target:'cards' as const}
  if(!round.openedAt&&round.status==='scheduled')return{mode:'preparation' as const,label:'Avvia il turno',target:'start' as const}
  return{mode:'live' as const,label:'Turno pronto',target:'fields' as const}
}
