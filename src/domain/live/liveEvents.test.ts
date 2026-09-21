import { describe,expect,it } from 'vitest'
import { buildLivePresentations,classifyLiveEvent,recipientsForLiveEvent } from './liveEvents'
import { createDemoTournament } from '../../demo/demoSeed'

describe('unified live event model',()=>{
  it('keeps score changes state-only and classifies operational events',()=>{
    expect(classifyLiveEvent('GAME_WON')).toBe('STATE_ONLY')
    expect(classifyLiveEvent('TIME_EXPIRED')).toBe('ACTION_REQUIRED')
    expect(classifyLiveEvent('DICE_ROLLED')).toBe('SHOW_EVENT')
  })
  it('keeps rejected cards private from displays',()=>{
    expect(recipientsForLiveEvent('CARD_REJECTED')).toEqual(['admin','referee','team'])
  })
  it('shows card resolution only to the requesting Team',()=>{
    const tournament=createDemoTournament();const match=tournament.matches[0]
    tournament.matchEvents=[{id:'active',matchId:match.id,type:'CARD_ACTIVATED',payload:{team_id:match.teamAId},actorUserId:'',createdAt:'2026-09-19T10:00:00Z'}]
    expect(buildLivePresentations(tournament,'team',{matchIds:[match.id],teamId:match.teamAId})[0]?.title).toBe('CARTA ATTIVATA')
    expect(buildLivePresentations(tournament,'team',{matchIds:[match.id],teamId:match.teamBId})).toEqual([])
    expect(buildLivePresentations(tournament,'main_display')).toEqual([])
  })
  it('scopes match presentations to the selected court and omits score/correction banners',()=>{
    const tournament=createDemoTournament();const first=tournament.matches[0];const other={...first,id:'other',courtId:'court-2'};tournament.matches.push(other)
    tournament.matchEvents=[
      {id:'score',matchId:first.id,type:'GAME_WON',payload:{},actorUserId:'',createdAt:'2026-09-19T10:00:00Z'},
      {id:'stb',matchId:first.id,type:'SUPER_TIEBREAK_REQUIRED',payload:{},actorUserId:'',createdAt:'2026-09-19T10:01:00Z'},
      {id:'foreign',matchId:other.id,type:'TIME_EXPIRED',payload:{set_number:1},actorUserId:'',createdAt:'2026-09-19T10:02:00Z'},
    ]
    const items=buildLivePresentations(tournament,'court_display',{courtId:first.courtId})
    expect(items.map(item=>item.id)).toEqual(['match:stb'])
  })
  it('collapses simultaneous centralized set starts on Main Display',()=>{
    const tournament=createDemoTournament();const first=tournament.matches[0];tournament.matches.push({...first,id:'second',courtId:'court-2'})
    tournament.matchEvents=[first.id,'second'].map((matchId,index)=>({id:`start-${index}`,matchId,type:'SET_1_STARTED' as const,payload:{set_number:1},actorUserId:'',createdAt:'2026-09-19T10:00:00Z'}))
    const items=buildLivePresentations(tournament,'main_display')
    expect(items).toHaveLength(1);expect(items[0].detail).toBe('Tutti i campi')
  })
})
