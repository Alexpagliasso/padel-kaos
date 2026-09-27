// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { dismissSpecialEventReveal, eventArtwork, openSpecialEventReveal } from './specialEventPresentation'

describe('special event broadcast',()=>{
  beforeEach(()=>sessionStorage.clear())
  it('uses authoritative event occurrence and local CONTINUA',()=>{
    const tournament=createDemoTournament()
    tournament.globalEvents=[{id:'event-1',code:'por_tres',type:'challenge',title:'Por Tres',description:'Fuori campo',status:'active',startedAt:new Date(Date.now()-6000).toISOString()}]
    const admin=openSpecialEventReveal(tournament,'admin',Date.now())!
    expect(admin.event.title).toBe('Por Tres')
    expect(eventArtwork(admin.event)).toContain('por-tres')
    dismissSpecialEventReveal(admin.key)
    expect(openSpecialEventReveal(tournament,'admin',Date.now())).toBeUndefined()
    expect(openSpecialEventReveal(tournament,'team',Date.now())).toBeTruthy()
    expect(tournament.globalEvents[0].status).toBe('active')
  })
  it('auto-dismisses displays and skips stale late joins',()=>{
    const tournament=createDemoTournament()
    tournament.globalEvents=[{id:'event-1',type:'challenge',title:'Por Tres',description:'Fuori campo',status:'active',startedAt:new Date(Date.now()-15000).toISOString()}]
    expect(openSpecialEventReveal(tournament,'main_display',Date.now())).toBeUndefined()
    expect(openSpecialEventReveal(tournament,'referee',Date.now())).toBeUndefined()
  })
  it('presents the same event type again when it has a new occurrence id',()=>{
    const tournament=createDemoTournament()
    const startedAt=new Date(Date.now()-6000).toISOString()
    tournament.globalEvents=[{id:'event-1',code:'por_tres',type:'challenge',title:'Por Tres',description:'Fuori campo',status:'active',startedAt}]
    const first=openSpecialEventReveal(tournament,'team',Date.now())!
    dismissSpecialEventReveal(first.key)
    tournament.globalEvents=[{...tournament.globalEvents[0],id:'event-2',startedAt:new Date().toISOString()}]
    const second=openSpecialEventReveal(tournament,'team',Date.now())!
    expect(second.key).not.toBe(first.key)
    expect(openSpecialEventReveal(tournament,'team',Date.now())?.key).toBe(second.key)
  })
})
