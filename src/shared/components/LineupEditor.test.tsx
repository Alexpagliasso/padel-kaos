// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,describe,expect,it} from 'vitest'
import {LineupEditor} from './LineupEditor'
import {createDemoTournament} from '../../demo/demoSeed'

afterEach(cleanup)

describe('LineupEditor',()=>{
  it('shows two selected players, the bench and locks a started set',()=>{const tournament=createDemoTournament();const match=tournament.matches[0];const team=tournament.teams.find(item=>item.id===match.teamAId)!;match.set1StartedAt=new Date().toISOString();render(<QueryClientProvider client={new QueryClient()}><LineupEditor tournamentId={tournament.id} match={match} team={team} setNumber={1}/></QueryClientProvider>);expect(screen.getByText(/Panchina:/)).toBeTruthy();expect(screen.getByText(/set è già iniziato/i)).toBeTruthy();team.players.forEach(player=>expect(screen.getByRole('button',{name:player.name}).hasAttribute('disabled')).toBe(true))})
  it('selects exactly two players and shows the third on the bench',()=>{const tournament=createDemoTournament();const match=tournament.matches[0];match.lineups=[];match.set1StartedAt=undefined;match.status='scheduled';const team=tournament.teams.find(item=>item.id===match.teamAId)!;render(<QueryClientProvider client={new QueryClient()}><LineupEditor tournamentId={tournament.id} match={match} team={team} setNumber={1}/></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:team.players[0].name}));fireEvent.click(screen.getByRole('button',{name:team.players[1].name}));expect(screen.getByText(team.players[2].name,{selector:'strong'})).toBeTruthy();expect(screen.getByRole('button',{name:'CONFERMA FORMAZIONE'}).hasAttribute('disabled')).toBe(false)})
})
