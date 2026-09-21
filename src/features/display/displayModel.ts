import type { Match, Tournament } from '../../shared/types/domain'
import { getPersistedSetResult } from '../../domain/live/readiness'

export function getCurrentTurn(tournament:Tournament){
  const rounds=[...(tournament.rounds??[])].sort((a,b)=>a.sequence-b.sequence)
  return rounds.find(round=>round.status!=='completed')??rounds.at(-1)
}
export function getTurnMatches(tournament:Tournament){
  const round=getCurrentTurn(tournament)
  const order=new Map(tournament.courts.map((court,index)=>[court.id,index]))
  return tournament.matches.filter(match=>!round||match.roundId===round.id).sort((a,b)=>(order.get(a.courtId)??999)-(order.get(b.courtId)??999)||a.id.localeCompare(b.id))
}
export function getCourtDisplayMatch(tournament:Tournament,courtId:string){
  const current=getTurnMatches(tournament).find(match=>match.courtId===courtId)
  if(current)return current
  const sequence=new Map((tournament.rounds??[]).map(round=>[round.id,round.sequence]))
  return tournament.matches.filter(match=>match.courtId===courtId).sort((a,b)=>(sequence.get(b.roundId??'')??-1)-(sequence.get(a.roundId??'')??-1))[0]
}
export function paginateMatches(matches:Match[],size=4){return Array.from({length:Math.ceil(matches.length/size)},(_,index)=>matches.slice(index*size,index*size+size))}
export function displayStatus(match:Match){
  if(match.status==='completed')return match.resultConfirmedAt?'Terminata':'Risultato da confermare'
  if(match.score.currentSet===3)return 'Super Tie-Break'
  if(match.status==='live_set_2')return 'Set 2'
  if(match.status==='set_break')return 'Intervallo · In attesa del dado'
  if(match.status==='live_set_1'||match.status==='live')return 'Set 1'
  return 'In attesa'
}
export function currentPair(tournament:Tournament,match:Match,teamId:string){
  const set=match.score.currentSet===3?3:match.status==='set_break'?2:match.score.currentSet
  const lineup=match.lineups.find(item=>item.teamId===teamId&&item.setNumber===set)
  const team=tournament.teams.find(item=>item.id===teamId)
  return lineup?.activePlayerIds.map(id=>team?.players.find(player=>player.id===id)?.name).filter(Boolean) as string[]|undefined
}
export function setHistory(tournament:Tournament,match:Match){return ([1,2] as const).flatMap(set=>{const result=getPersistedSetResult(tournament,match.id,set);return result?[{set,gamesA:result.gamesA,gamesB:result.gamesB}]:[]})}
export function globalLayout(count:number){return count===1?'grid-cols-1':count===2?'grid-cols-2':count===3?'grid-cols-3':'grid-cols-2 grid-rows-2'}
