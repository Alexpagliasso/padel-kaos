import { describe, expect, it, vi } from 'vitest'
import { assignSupabaseRandomTeamRankings, mapTeamRankingError, setSupabaseTeamRanking } from './supabaseRepositories'
import { supabaseTournamentKeys } from './queryKeys'

describe('repository ranking squadre', () => {
  it('usa le firme RPC esatte per assegnazione, modifica, rimozione e assegnazione casuale', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const client = { rpc }
    await setSupabaseTeamRanking(client, 'team-a', 4)
    await setSupabaseTeamRanking(client, 'team-a', null)
    await assignSupabaseRandomTeamRankings(client, 'tournament-a')
    expect(rpc.mock.calls).toEqual([
      ['set_team_ranking', { p_team_id: 'team-a', p_ranking: 4 }],
      ['set_team_ranking', { p_team_id: 'team-a', p_ranking: null }],
      ['assign_random_team_rankings', { p_tournament_id: 'tournament-a' }],
    ])
  })

  it('traduce chiaramente il vincolo di unicità conservando la causa', () => {
    const backend = { code: '23505', message: 'duplicate key violates teams_tournament_ranking_unique_idx' }
    const error = mapTeamRankingError(backend, 1)
    expect(error.message).toBe("Il ranking 1 è già assegnato a un'altra squadra.")
    expect(error.cause).toBe(backend)
  })

  it('mantiene separate le chiavi cache dei tornei', () => {
    expect(supabaseTournamentKeys.detail('tournament-a')).not.toEqual(supabaseTournamentKeys.detail('tournament-b'))
  })
})
