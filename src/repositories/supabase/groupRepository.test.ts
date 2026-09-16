import { describe, expect, it, vi } from 'vitest'
import { createGroupRepository, groupError } from './groupRepository'
import type { requireSupabase } from '../../services/supabase/client'
describe('repository gironi', () => {
  it('invia una sola RPC con il payload verificato', async () => {
    const rpc = vi.fn().mockResolvedValue({error:null})
    const repo = createGroupRepository({ rpc } as unknown as ReturnType<typeof requireSupabase>)
    await repo.replaceTournamentGroups('A',[{name:'Girone A',sortOrder:1,teamIds:['a','b']}])
    expect(rpc.mock.calls).toEqual([['replace_tournament_groups',{p_tournament_id:'A',p_groups:[{name:'Girone A',sort_order:1,team_ids:['a','b']}]}]])
  })
  it('filtra gli spostamenti per torneo e squadra', async () => {
    const q = { update:vi.fn(),eq:vi.fn(),select:vi.fn(),single:vi.fn().mockResolvedValue({data:{id:'t'},error:null}) }
    q.update.mockReturnValue(q); q.eq.mockReturnValue(q); q.select.mockReturnValue(q)
    const from = vi.fn().mockReturnValue(q)
    await createGroupRepository({from} as unknown as ReturnType<typeof requireSupabase>).moveTeamToGroup('A','t','g')
    expect(from).toHaveBeenCalledWith('teams')
    expect(q.update).toHaveBeenCalledWith({group_id:'g'})
    expect(q.eq.mock.calls).toEqual([['tournament_id','A'],['id','t']])
  })
  it('traduce concorrenza e partite collegate conservando la causa', () => {
    const backend = {code:'40P01',message:'deadlock detected'}
    expect(groupError(backend).message).toContain('contemporaneamente')
    expect(groupError(backend).cause).toBe(backend)
    expect(groupError({message:'cannot replace groups referenced by matches'}).message).toContain('partite collegate')
  })
})
