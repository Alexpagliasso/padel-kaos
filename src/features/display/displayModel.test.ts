import {describe,expect,it} from 'vitest'
import {createDemoTournament} from '../../demo/demoSeed'
import {displayStatus,getCourtDisplayMatch,getTurnMatches,globalLayout,paginateMatches} from './displayModel'

describe('display turn model',()=>{
  it('keeps deterministic court order and completed matches in the turn',()=>{
    const tournament=createDemoTournament();const matches=[...tournament.matches].reverse();tournament.matches=matches
    const result=getTurnMatches(tournament)
    expect(result.map(match=>tournament.courts.findIndex(court=>court.id===match.courtId))).toEqual([...result.map(match=>tournament.courts.findIndex(court=>court.id===match.courtId))].sort((a,b)=>a-b))
  })
  it('paginates 6 and 10 courts as 4+2 and 4+4+2',()=>{
    const sample=Array.from({length:10},(_,index)=>({id:String(index)})) as never[]
    expect(paginateMatches(sample.slice(0,6))).toHaveLength(2);expect(paginateMatches(sample.slice(0,6)).map(page=>page.length)).toEqual([4,2])
    expect(paginateMatches(sample).map(page=>page.length)).toEqual([4,4,2])
  })
  it('uses intentional 1-4 court layouts',()=>expect([1,2,3,4].map(globalLayout)).toEqual(['grid-cols-1','grid-cols-2','grid-cols-3','grid-cols-2 grid-rows-2']))
  it('maps lifecycle labels to Italian',()=>{const match=createDemoTournament().matches[0];expect(displayStatus({...match,status:'set_break'})).toContain('Intervallo');expect(displayStatus({...match,status:'completed'})).toBe('Risultato da confermare');expect(displayStatus({...match,status:'completed',resultConfirmedAt:'2026-09-18T10:00:00Z'})).toBe('Terminata')})
  it('moves a court display from the historical match to the current turn',()=>{
    const tournament=createDemoTournament();const old=tournament.matches[0];old.status='completed';old.resultConfirmedAt='2026-09-19T09:00:00Z';tournament.rounds![0].status='completed'
    tournament.rounds!.push({...tournament.rounds![0],id:'round-demo-2',name:'ROUND 2',sequence:2,status:'scheduled'})
    tournament.matches.push({...old,id:'match-court-1-next',roundId:'round-demo-2',status:'scheduled',resultConfirmedAt:undefined})
    expect(getCourtDisplayMatch(tournament,'court-1')?.id).toBe('match-court-1-next')
  })
})
