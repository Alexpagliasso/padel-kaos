// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createDemoTournament } from '../demo/demoSeed'
import { formatRemaining, getCurrentSubmittedSet, getRefereeReviewSet, RefereeLiveMatch } from './RefereeRoute'

afterEach(cleanup)

function setup(configure?: (tournament: ReturnType<typeof createDemoTournament>) => void) {
  const tournament=createDemoTournament()
  const match=tournament.matches[0]
  match.status='live_set_1'
  configure?.(tournament)
  render(<QueryClientProvider client={new QueryClient()}><RefereeLiveMatch tournament={tournament} match={match} teamA={tournament.teams[0]} teamB={tournament.teams[1]}/></QueryClientProvider>)
  return {tournament,match}
}

describe('referee live match core',()=>{
  it('shows large game controls for both teams',()=>{
    setup()
    expect(screen.getAllByRole('button',{name:'+ GAME'})).toHaveLength(2)
  })

  it('requires confirmation before replacing a non-zero score',()=>{
    setup(t=>{t.matches[0].score.games={A:2,B:1}})
    fireEvent.click(screen.getByRole('button',{name:'MODIFICA RISULTATO'}))
    fireEvent.click(screen.getByRole('button',{name:'Aumenta TEAM RED'}))
    fireEvent.click(screen.getByRole('button',{name:'CONFERMA MODIFICA'}))
    expect(screen.getByText(/Confermi il punteggio 3–1/)).toBeTruthy()
    expect(screen.getByRole('button',{name:'CONFERMA MODIFICA'})).toBeTruthy()
  })

  it('queues multiple requests and limits Il Prescelto to the two active players',()=>{
    setup(t=>{
      t.cards.push({...t.cards[0],id:'chosen',name:'Il Prescelto',slug:'il-prescelto',durationType:'timed',durationValue:300})
      t.teamCards=[
        {id:'request-1',teamId:'team-red',cardId:'chosen',matchId:'match-demo-1',state:'pending'},
        {id:'request-2',teamId:'team-blue',cardId:'card-blackout',matchId:'match-demo-1',state:'pending'},
      ]
    })
    expect(screen.getByText('CARTA GIOCATA · 2')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button',{name:'GESTISCI'})[0])
    expect(screen.getByLabelText('Mario Rossi')).toBeTruthy()
    expect(screen.getByLabelText('Giulia Ferri')).toBeTruthy()
    expect(screen.queryByLabelText('Leo Costa')).toBeNull()
    expect(screen.getByRole('button',{name:'CONFERMA CARTA'}).hasAttribute('disabled')).toBe(true)
  })

  it('reconstructs the timer from persisted expiry',()=>{
    expect(formatRemaining('2026-09-17T12:05:00.000Z',Date.parse('2026-09-17T12:02:47.000Z'))).toBe('02:13')
  })

  it('shows submission only after the current Set 1 timer expires',()=>{
    const {match}=setup(t=>{t.matches[0].set1StartedAt=new Date(Date.now()-16*60_000).toISOString();t.matches[0].activeSetDurationMinutes=15;t.matches[0].score.games={A:6,B:4}})
    expect(getRefereeReviewSet(match,true)).toBe(1)
    expect(screen.getByRole('button',{name:'INVIA RISULTATO ALLA REGIA'})).toBeTruthy()
  })

  it('does not expose submission while the current timer is active',()=>{
    const {match}=setup(t=>{t.matches[0].set1StartedAt=new Date().toISOString();t.matches[0].activeSetDurationMinutes=15})
    expect(getRefereeReviewSet(match,false)).toBeUndefined()
    expect(screen.queryByRole('button',{name:'INVIA RISULTATO ALLA REGIA'})).toBeNull()
  })

  it('uses only the current Set 2 submission and does not reuse the Set 1 timestamp',()=>{
    const{match}=setup(t=>{const m=t.matches[0];m.status='live_set_2';m.score.currentSet=2;m.set1ResultSubmittedAt='2026-10-01T10:16:00Z';m.set2StartedAt=new Date(Date.now()-16*60_000).toISOString();m.activeSetDurationMinutes=15})
    expect(getCurrentSubmittedSet(match)).toBeUndefined()
    expect(getRefereeReviewSet(match,true)).toBe(2)
    expect(screen.getByRole('button',{name:'INVIA RISULTATO ALLA REGIA'})).toBeTruthy()
  })

  it('shows submitted state and removes the send action after the current timestamp arrives',()=>{
    const{match}=setup(t=>{t.matches[0].set1ResultSubmittedAt='2026-10-01T10:16:00Z'})
    expect(getCurrentSubmittedSet(match)).toBe(1)
    expect(screen.getByText(/RISULTATO SET 1 INVIATO ALLA REGIA/)).toBeTruthy()
    expect(screen.queryByRole('button',{name:'INVIA RISULTATO ALLA REGIA'})).toBeNull()
  })
})
