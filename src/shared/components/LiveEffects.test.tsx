// @vitest-environment jsdom
import { render,screen } from '@testing-library/react'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { describe,expect,it } from 'vitest'
import { GlobalDiceReveal } from './LiveEffects'
import { createDemoTournament } from '../../demo/demoSeed'

describe('GlobalDiceReveal',()=>{
  it('reconstructs a recent persisted reveal and shows the Italian outcome',()=>{
    sessionStorage.clear()
    const tournament=createDemoTournament()
    const round=tournament.rounds![0]
    const rule=tournament.diceRules[0]
    round.diceResult=rule.value; round.diceRuleId=rule.id; round.diceRolledAt=new Date().toISOString()
    render(<QueryClientProvider client={new QueryClient()}><GlobalDiceReveal tournament={tournament}/></QueryClientProvider>)
    expect(screen.getByRole('dialog',{name:'Risultato dado globale'})).toBeTruthy()
    expect(screen.getByText(rule.title)).toBeTruthy()
  })
})
