import { describe, expect, it, vi } from 'vitest'
import { confirmSupabaseLineup, mapLineupError } from './lineupRepository'

describe('confirmSupabaseLineup', () => {
  it('invia identità di partita, squadra, fase e coppia all’RPC atomico', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await confirmSupabaseLineup({ rpc }, {
      tournamentId: 'tournament-a', matchId: 'match-a', teamId: 'team-a', setNumber: 2, playerIds: ['p1', 'p3'],
    })
    expect(rpc).toHaveBeenCalledWith('confirm_match_lineup', {
      p_match_id: 'match-a', p_team_id: 'team-a', p_set_number: 2, p_player_1_id: 'p1', p_player_2_id: 'p3',
    })
  })

  it('espone in italiano il rifiuto di coppia duplicata', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'pair already used in this match' } })
    await expect(confirmSupabaseLineup({ rpc }, {
      tournamentId: 'tournament-a', matchId: 'match-a', teamId: 'team-a', setNumber: 2, playerIds: ['p1', 'p2'],
    })).rejects.toThrow('Questa coppia è già stata usata')
    expect(mapLineupError('not authorized')).toContain('Non sei autorizzato')
  })
})
