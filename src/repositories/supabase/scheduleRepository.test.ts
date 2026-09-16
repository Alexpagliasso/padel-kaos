import { describe, expect, it } from 'vitest'
import { toScheduleRpcPayload } from './scheduleRepository'

describe('schedule repository payload', () => {
  it('mappa un Turno nel formato atomico della RPC', () => {
    expect(toScheduleRpcPayload([{ sequence: 2, matches: [{ groupId: 'g', courtId: 'c', teamAId: 'a', teamBId: 'b' }] }])).toEqual([{
      sequence: 2,
      matches: [{ group_id: 'g', court_id: 'c', team_a_id: 'a', team_b_id: 'b' }],
    }])
  })
})
