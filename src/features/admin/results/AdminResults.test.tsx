import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe,expect,it } from 'vitest'
import { createDemoTournament } from '../../../demo/demoSeed'
import { AdminResultsContent } from './AdminResults'

describe('Admin Results',()=>{
  it('keeps results separate from standings and exposes every group match as an accordion',()=>{
    const tournament=createDemoTournament()
    tournament.matchEvents=[
      {id:'s1',matchId:tournament.matches[0].id,type:'SET_WON',payload:{set_number:1,games_a:7,games_b:5},actorUserId:'ref',createdAt:'2026-09-18T10:00:00Z'},
      {id:'s2',matchId:tournament.matches[0].id,type:'SET_WON',payload:{set_number:2,games_a:4,games_b:6},actorUserId:'ref',createdAt:'2026-09-18T10:20:00Z'},
    ]
    const html=renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><AdminResultsContent tournament={tournament}/></QueryClientProvider>)
    expect(html).toContain('RISULTATI')
    expect(html).toContain('DEMO GROUP')
    expect(html).toContain('ROUND 1')
    expect(html).toContain('TEAM RED')
  })
})
