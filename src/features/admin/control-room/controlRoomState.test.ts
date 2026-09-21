import { describe,expect,it } from 'vitest'
import { createDemoTournament } from '../../../demo/demoSeed'
import { getControlRoomRound,getCurrentRoundMatches,getOperationalAttention } from './controlRoomState'

describe('current Regia round',()=>{
  it('moves from a completed first round to the next round without stale matches',()=>{
    const tournament=createDemoTournament()
    tournament.rounds=[{...tournament.rounds![0],status:'completed'},{...tournament.rounds![0],id:'round-2',name:'Turno 2',sequence:2,status:'scheduled'}]
    tournament.matches.push({...tournament.matches[0],id:'match-2-round',roundId:'round-2'})
    const current=getControlRoomRound(tournament)
    expect(current?.id).toBe('round-2')
    expect(getCurrentRoundMatches(tournament,current).map(match=>match.id)).toEqual(['match-2-round'])
  })
  it('contains only unresolved operational attention items',()=>{
    const tournament=createDemoTournament();const match=tournament.matches[0]
    match.set1EndedAt='2026-09-19T10:00:00Z';match.set1ResultSubmittedAt=undefined
    tournament.teamCards[0].state='pending';tournament.teamCards[0].matchId=match.id
    const messages=getOperationalAttention(tournament,tournament.rounds?.[0]).map(item=>item.message)
    expect(messages.some(message=>message.includes('Risultato Set 1 da inviare'))).toBe(true)
    expect(messages.some(message=>message.includes('carta in attesa'))).toBe(true)
  })
})
