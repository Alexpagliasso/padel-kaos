// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import {createDemoTournament} from '../../../demo/demoSeed'
import {entryFromTournament} from '../workspace/workspaceStore'
import {TournamentManagementView} from './TournamentManagement'

afterEach(cleanup)
const entries=()=>{const first=createDemoTournament();first.id='one';first.name='Test Uno';first.createdAt='2026-09-01T10:00:00Z';first.status='live';const second={...createDemoTournament(),id:'two',name:'Test Due',createdAt:'2026-09-02T10:00:00Z',status:'draft' as const};return [entryFromTournament(first),entryFromTournament(second)]}
const mount=(onDelete=vi.fn().mockResolvedValue(undefined))=>render(<MemoryRouter><TournamentManagementView entries={entries()} onOpen={vi.fn()} onDelete={onDelete}/></MemoryRouter>)

describe('Gestione tornei',()=>{
  it('lists, searches and orders accessible tournaments',()=>{mount();expect(screen.getByText('Test Uno')).toBeTruthy();expect(screen.getByText('Test Due')).toBeTruthy();fireEvent.change(screen.getByLabelText('Cerca per nome'),{target:{value:'due'}});expect(screen.queryByText('Test Uno')).toBeNull();expect(screen.getByText('Test Due')).toBeTruthy()})
  it('requires the exact name before deleting',async()=>{const remove=vi.fn().mockResolvedValue(undefined);mount(remove);fireEvent.click(screen.getAllByRole('button',{name:'ELIMINA TORNEO'})[0]);const submit=screen.getByRole('button',{name:'ELIMINA DEFINITIVAMENTE'});expect(submit.hasAttribute('disabled')).toBe(true);fireEvent.change(screen.getByLabelText('Digita esattamente il nome del torneo'),{target:{value:'Test Due'}});fireEvent.click(submit);await waitFor(()=>expect(remove).toHaveBeenCalledWith(expect.objectContaining({domain:expect.objectContaining({id:'two'})}),false))})
  it('requires explicit confirmation for an active tournament',()=>{mount();fireEvent.click(screen.getAllByRole('button',{name:'ELIMINA TORNEO'})[1]);fireEvent.change(screen.getByLabelText('Digita esattamente il nome del torneo'),{target:{value:'Test Uno'}});expect(screen.getByRole('button',{name:'ELIMINA DEFINITIVAMENTE'}).hasAttribute('disabled')).toBe(true);fireEvent.click(screen.getByLabelText(/partite in corso/i));expect(screen.getByRole('button',{name:'ELIMINA DEFINITIVAMENTE'}).hasAttribute('disabled')).toBe(false)})
  it('keeps the dialog retryable after a partial backend error',async()=>{mount(vi.fn().mockRejectedValue(new Error('Eliminazione incompleta: 1 account non rimosso.')));fireEvent.click(screen.getAllByRole('button',{name:'ELIMINA TORNEO'})[0]);fireEvent.change(screen.getByLabelText('Digita esattamente il nome del torneo'),{target:{value:'Test Due'}});fireEvent.click(screen.getByRole('button',{name:'ELIMINA DEFINITIVAMENTE'}));expect(await screen.findByText(/Eliminazione incompleta/)).toBeTruthy();expect(screen.getByRole('button',{name:'ELIMINA DEFINITIVAMENTE'}).hasAttribute('disabled')).toBe(false)})
})
