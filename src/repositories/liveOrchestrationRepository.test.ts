import { describe, expect, it } from 'vitest'
import { mapLiveError } from './liveOrchestrationRepository'

describe('live RPC error reporting', () => {
  it('explains absent authoritative dice faces without exposing raw SQL errors', () => {
    expect(mapLiveError('authoritative dice faces are not configured')).toContain('sei facce')
  })

  it('explains lifecycle and invalid result corrections', () => {
    expect(mapLiveError('set 1 results are incomplete')).toContain('Set 1')
    expect(mapLiveError('invalid corrected result')).toContain('punteggi validi')
    expect(mapLiveError('super tie-break is not required')).toContain('Super Tie-Break')
    expect(mapLiveError('invalid input syntax for type uuid: "(entire matches row)"')).not.toContain('matches row')
  })
})
