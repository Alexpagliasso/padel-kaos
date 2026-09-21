import { describe, expect, it } from 'vitest'
import { formatCountdown, getDiceEffect, getPersistedSetResult } from './readiness'
import type { Match, Tournament } from '../../shared/types/domain'

const match = { id:'m1', roundId:'r1', courtId:'c1', groupId:'g1', teamAId:'a', teamBId:'b', status:'live_set_2', score:{ points:{A:'0',B:'0'}, games:{A:0,B:0}, sets:{A:1,B:0}, currentSet:2 }, lineups:[], activeCardUsageIds:[], set2StartedAt:'2026-09-17T10:00:00.000Z' } satisfies Match
const tournament = { id:'t1',name:'T',groups:[],courts:[],teams:[],matches:[match],cards:[],teamCards:[],diceRules:[{id:'d1',value:4,title:'Effetto',description:'Descrizione',effectType:'x',durationSeconds:300,enabled:true}],rounds:[{id:'r1',tournamentId:'t1',name:'R',stage:'group',sequence:1,status:'live_set_2',diceResult:4,diceRuleId:'d1'}],kaosEvents:[],matchEvents:[{id:'e1',matchId:'m1',type:'SET_WON',payload:{set_number:1,games_a:7,games_b:5},actorUserId:'u',createdAt:'2026-09-17T09:59:00Z'}],globalEvents:[],standings:[] } satisfies Tournament

describe('live readiness',()=>{
  it('reads the persisted historical set result',()=>expect(getPersistedSetResult(tournament,'m1',1)).toEqual({gamesA:7,gamesB:5}))
  it('derives the dice window from Set 2 start and survives refresh',()=>{
    expect(getDiceEffect(tournament,match,new Date('2026-09-17T10:02:00Z').getTime()).remainingSeconds).toBe(180)
    expect(getDiceEffect(tournament,match,new Date('2026-09-17T10:05:00Z').getTime()).active).toBe(false)
    expect(formatCountdown(180)).toBe('03:00')
  })
})
