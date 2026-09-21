// @vitest-environment jsdom
import { cleanup, fireEvent, render,screen } from '@testing-library/react'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { GlobalDiceReveal } from './GlobalDiceReveal'
import { createDemoTournament } from '../../demo/demoSeed'

describe('GlobalDiceReveal',()=>{
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  it('reconstructs a recent persisted reveal and shows the Italian outcome',()=>{
    sessionStorage.clear()
    const tournament=createDemoTournament()
    const round=tournament.rounds![0]
    const rule=tournament.diceRules[0]
    round.diceResult=rule.value; round.diceRuleId=rule.id; round.diceRolledAt=new Date().toISOString()
    render(<QueryClientProvider client={new QueryClient()}><GlobalDiceReveal tournament={tournament} audience="admin"/></QueryClientProvider>)
    expect(screen.getByRole('dialog',{name:'Risultato dado globale'})).toBeTruthy()
    expect(screen.getByLabelText('Dado: in movimento')).toBeTruthy()
  })
  it('shows the rule immediately when reduced motion is preferred',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
    const tournament=createDemoTournament()
    const round=tournament.rounds![0]
    const rule=tournament.diceRules[0]
    round.diceResult=rule.value;round.diceRuleId=rule.id;round.diceRolledAt=new Date().toISOString()
    render(<QueryClientProvider client={new QueryClient()}><GlobalDiceReveal tournament={tournament} audience="team"/></QueryClientProvider>)
    expect(screen.getByRole('heading',{name:'1 VS 1',level:2})).toBeTruthy()
    expect(screen.getByAltText('Illustrazione 1 VS 1')).toBeTruthy()
  })
  it('requires local CONTINUA after the readable phase',()=>{
    sessionStorage.clear()
    const tournament=createDemoTournament()
    const round=tournament.rounds![0]
    const rule=tournament.diceRules[0]
    round.diceResult=rule.value;round.diceRuleId=rule.id;round.diceRolledAt=new Date(Date.now()-6000).toISOString()
    render(<QueryClientProvider client={new QueryClient()}><GlobalDiceReveal tournament={tournament} audience="referee"/></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button',{name:'CONTINUA'}))
    expect(screen.queryByRole('dialog',{name:'Risultato dado globale'})).toBeNull()
  })
})
