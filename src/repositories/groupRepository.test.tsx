// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabaseTournamentKeys } from './supabase/queryKeys'
const mocks = vi.hoisted(() => ({ replace:vi.fn(), move:vi.fn(), workspace: { data:{id:'A'},entry:{},remote:true } }))
vi.mock('../features/admin/workspace/useAdminWorkspace', () => ({ useAdminWorkspace: () => mocks.workspace }))
vi.mock('./supabase/groupRepository', () => ({ createGroupRepository: () => ({replaceTournamentGroups:mocks.replace,moveTeamToGroup:mocks.move}) }))
import { useGroupManagement } from './groupRepository'
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('cache gironi isolata', () => {
  it('invalida A anche dopo errore concorrente senza invalidare B', async () => {
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
    client.setQueryData(supabaseTournamentKeys.detail('A'),{id:'A'})
    client.setQueryData(supabaseTournamentKeys.detail('B'),{id:'B'})
    mocks.move.mockRejectedValue(new Error('concorrenza'))
    const {result} = renderHook(() => useGroupManagement(), { wrapper: ({children}) => createElement(QueryClientProvider,{client},children) })
    await act(async () => { await expect(result.current.move('team','group')).rejects.toThrow('concorrenza') })
    expect(client.getQueryState(supabaseTournamentKeys.detail('A'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(supabaseTournamentKeys.detail('B'))?.isInvalidated).toBe(false)
  })
})
