import { describe,expect,it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { getSetTimer } from './setTimer'

describe('authoritative set timer projection',()=>{
  it('uses the duration locked by the backend and never becomes negative',()=>{
    const match={...createDemoTournament().matches[0],status:'live_set_1' as const,set1StartedAt:'2026-09-18T10:00:00.000Z',activeSetDurationMinutes:2}
    expect(getSetTimer(match,new Date('2026-09-18T10:01:00.000Z').getTime())?.remainingSeconds).toBe(60)
    expect(getSetTimer(match,new Date('2026-09-18T10:03:00.000Z').getTime())).toMatchObject({remainingSeconds:0,expired:true})
  })
})
