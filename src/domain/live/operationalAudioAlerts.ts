import type { Tournament } from '../../shared/types/domain'

export type OperationalAlertKind='set'|'dice'|'card'
export type OperationalTimer={id:string;kind:OperationalAlertKind;deadline:number;label:string}
export type OperationalAlert={id:string;kind:OperationalAlertKind;label:string}

export function getOperationalTimers(tournament:Tournament):OperationalTimer[]{
  const timers:OperationalTimer[]=[]
  for(const match of tournament.matches){
    const duration=(match.activeSetDurationMinutes??15)*60_000
    if(match.set1StartedAt)timers.push({id:`set:${match.id}:1`,kind:'set',deadline:new Date(match.set1StartedAt).getTime()+duration,label:'Fine Set 1'})
    if(match.set2StartedAt)timers.push({id:`set:${match.id}:2`,kind:'set',deadline:new Date(match.set2StartedAt).getTime()+duration,label:'Fine Set 2'})
  }
  for(const round of tournament.rounds??[]){
    if(round.diceEndsAt)timers.push({id:`dice:${round.id}:${round.diceEndsAt}`,kind:'dice',deadline:new Date(round.diceEndsAt).getTime(),label:'Effetto dado terminato'})
  }
  for(const card of tournament.teamCards){
    if(!card.expiresAt)continue
    const definition=tournament.cards.find(item=>item.id===(card.resolvedCardDefinitionId??card.cardId))
    if(definition?.durationType!=='timed')continue
    timers.push({id:`card:${card.id}:${card.expiresAt}`,kind:'card',deadline:new Date(card.expiresAt).getTime(),label:`${definition.name} terminata`})
  }
  return timers.filter(timer=>Number.isFinite(timer.deadline))
}

export class OperationalExpiryTracker{
  private states=new Map<string,boolean>()
  private alerted=new Set<string>()
  update(timers:OperationalTimer[],now:number):OperationalAlert[]{
    const alerts:OperationalAlert[]=[]
    for(const timer of timers){
      const active=timer.deadline>now
      const previous=this.states.get(timer.id)
      if(previous===true&&!active&&!this.alerted.has(timer.id)){
        this.alerted.add(timer.id);alerts.push({id:timer.id,kind:timer.kind,label:timer.label})
      }
      this.states.set(timer.id,active)
    }
    return alerts
  }
}
