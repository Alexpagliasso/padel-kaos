import { describe, expect, it, vi } from 'vitest'
import { createDemoTournament } from '../demo/demoSeed'
import { persistAndReloadSchedule, persistedGroupStageTurns } from './scheduleRepository'

describe('persisted group-stage schedule', () => {
  it('reconstructs persisted rounds and matches after a fresh load', () => {
    const tournament = createDemoTournament()
    const firstLoad = persistedGroupStageTurns(tournament)
    const freshLoad = persistedGroupStageTurns(structuredClone(tournament))

    expect(firstLoad.length).toBeGreaterThan(0)
    expect(freshLoad).toEqual(firstLoad)
    expect(freshLoad.flatMap((turn) => turn.matches).length).toBeGreaterThan(0)
  })

  it('awaits persistence and reloads the authoritative Supabase state', async () => {
    const tournament = createDemoTournament()
    const turns = persistedGroupStageTurns(tournament)
    const replace = vi.fn().mockResolvedValue(undefined)
    const load = vi.fn().mockResolvedValue(structuredClone(tournament))

    const result = await persistAndReloadSchedule({ tournamentId: tournament.id, turns, replace, load })

    expect(replace).toHaveBeenCalledWith(tournament.id, turns)
    expect(load).toHaveBeenCalledWith(tournament.id)
    expect(persistedGroupStageTurns(result)).toEqual(turns)
  })

  it('rejects success when the persisted reload contains no calendar', async () => {
    const tournament = createDemoTournament()
    const turns = persistedGroupStageTurns(tournament)

    await expect(persistAndReloadSchedule({
      tournamentId: tournament.id,
      turns,
      replace: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue({ ...tournament, rounds: [], matches: [] }),
    })).rejects.toThrow('Impossibile salvare il calendario')
  })

  it('reports a persisted-calendar load failure separately', async () => {
    const tournament = createDemoTournament()
    const turns = persistedGroupStageTurns(tournament)

    await expect(persistAndReloadSchedule({
      tournamentId: tournament.id,
      turns,
      replace: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockRejectedValue(new Error('permission denied')),
    })).rejects.toThrow('Impossibile caricare il calendario salvato')
  })
})
