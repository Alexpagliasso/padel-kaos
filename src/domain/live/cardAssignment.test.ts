import { describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { roundCardsLocked } from './cardAssignment'

describe('round card assignment gate',()=>{
  it('locks every match when the round opens or any court starts',()=>{
    const tournament=createDemoTournament()
    const round=tournament.rounds![0]
    const matches=tournament.matches.filter(match=>match.roundId===round.id)
    expect(roundCardsLocked(round,matches)).toBe(false)
    round.openedAt=new Date().toISOString()
    expect(roundCardsLocked(round,matches)).toBe(true)
    round.openedAt=undefined
    matches[0].status='live_set_1'
    expect(roundCardsLocked(round,matches)).toBe(true)
  })
})
