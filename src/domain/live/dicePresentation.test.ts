// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { dismissDiceReveal, openDiceReveal } from './dicePresentation'

describe('dice presentation lifecycle',()=>{
  beforeEach(()=>sessionStorage.clear())
  function rolledTournament(ageMs:number){
    const tournament=createDemoTournament()
    const round=tournament.rounds![0]
    const rule=tournament.diceRules[0]
    round.diceResult=rule.value
    round.diceRuleId=rule.id
    round.diceRolledAt=new Date(Date.now()-ageMs).toISOString()
    return tournament
  }
  it('keeps an entered interactive reveal open until local dismissal, including refresh',()=>{
    const tournament=rolledTournament(6000)
    const entry=openDiceReveal(tournament,'admin',Date.now())!
    expect(entry.face.title).toBe('1 VS 1')
    expect(openDiceReveal(tournament,'admin',Date.now()+20000)).toBeTruthy()
    dismissDiceReveal(entry.key)
    expect(openDiceReveal(tournament,'admin',Date.now())).toBeUndefined()
    expect(openDiceReveal(tournament,'referee',Date.now())).toBeTruthy()
  })
  it('skips late joins but dismisses unattended displays after twelve seconds',()=>{
    const tournament=rolledTournament(13000)
    expect(openDiceReveal(tournament,'team',Date.now())).toBeUndefined()
    expect(openDiceReveal(tournament,'main_display',Date.now())).toBeUndefined()
    const recent=rolledTournament(6000)
    expect(openDiceReveal(recent,'court_display',Date.now())).toBeTruthy()
    expect(openDiceReveal(recent,'court_display',Date.now()+7000)).toBeUndefined()
  })
})
