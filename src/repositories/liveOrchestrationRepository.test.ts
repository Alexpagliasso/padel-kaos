import { describe, expect, it } from 'vitest'
import { defaultCardsPerTeam, mapLiveError, normalizeCardsPerTeam } from './liveOrchestrationRepository'

describe('live orchestration repository', () => {
  it('defaults to three cards per team and clamps the selectable range', () => {
    expect(defaultCardsPerTeam).toBe(3)
    expect(normalizeCardsPerTeam(0)).toBe(1)
    expect(normalizeCardsPerTeam(6)).toBe(6)
    expect(normalizeCardsPerTeam(99)).toBe(10)
  })

  it('maps operational failures to Italian messages', () => {
    expect(mapLiveError('round cards incomplete: {}')).toBe('ASSEGNA LE CARTE PRIMA DI AVVIARE IL TURNO.')
    expect(mapLiveError('cards already assigned')).toContain('già state assegnate')
    expect(mapLiveError('one or more match lineups are missing')).toContain('formazioni')
    expect(mapLiveError('not authorized')).toContain('Non sei autorizzato')
  })
})
