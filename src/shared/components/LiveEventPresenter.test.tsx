// @vitest-environment jsdom
import { cleanup,render,screen } from '@testing-library/react'
import { afterEach,describe,expect,it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { LiveEventPresenter } from './LiveEventPresenter'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'

afterEach(()=>{cleanup();sessionStorage.clear()})
describe('LiveEventPresenter',()=>{
  it('does not replay historical presentations on first mount',()=>{
    const tournament=createDemoTournament();tournament.matchEvents.push({id:'old',matchId:tournament.matches[0].id,type:'TIME_EXPIRED',payload:{set_number:1},actorUserId:'',createdAt:new Date().toISOString()})
    render(<QueryClientProvider client={new QueryClient()}><LiveEventPresenter tournament={tournament} audience="team" matchIds={[tournament.matches[0].id]}/></QueryClientProvider>)
    expect(screen.queryByText('TEMPO SCADUTO')).toBeNull()
  })
})
