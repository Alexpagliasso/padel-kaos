import type { GlobalEvent, Match, Round, Tournament } from '../../../shared/types/domain'

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
