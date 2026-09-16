// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupSetupContent } from './GroupSetup'
import type { useGroupManagement } from '../../../repositories/groupRepository'
const fixture = (status='draft') => ({ data:{id:'A',status,teamsCount:2,teamsPerGroup:2,courtsCount:1, teams:[{id:'a',name:'Alfa',ranking:1,groupId:'g'},{id:'b',name:'Beta',ranking:2,groupId:'g'}],groups:[{id:'g',name:'Girone A'}],courts:[]},remote:true,replace:vi.fn().mockResolvedValue(undefined),move:vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof useGroupManagement>)
afterEach(() => {cleanup();vi.restoreAllMocks()})
describe('UI gironi', () => {
  it('blocca generazione e spostamenti in corso', () => {
    render(<GroupSetupContent management={fixture('live')} />)
    expect((screen.getByRole('button',{name:'Rigenera gironi'}) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByRole('combobox').every(el => el.getAttribute('aria-disabled') === 'true')).toBe(true)
  })
  it('richiede conferma prima di sostituire i gironi', async () => {
    const m = fixture(); const confirm = vi.spyOn(window,'confirm').mockReturnValue(false)
    render(<GroupSetupContent management={m} />)
    fireEvent.click(screen.getByRole('button',{name:'Rigenera gironi'})); expect(m.replace).not.toHaveBeenCalled()
    confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Rigenera gironi'}))
    await waitFor(() => expect(m.replace).toHaveBeenCalledWith([{name:'Girone A',sortOrder:1,teamIds:['a','b']}]))
  })
  it('blocca il numero squadre incoerente', () => {
    const m=fixture();m.data.teamsCount=30
    render(<GroupSetupContent management={m} />)
    expect(screen.getByText('Il torneo è configurato per 30 squadre, ma ne risultano registrate 2.')).toBeTruthy()
    expect((screen.getByRole('button',{name:'Rigenera gironi'}) as HTMLButtonElement).disabled).toBe(true)
  })
})
