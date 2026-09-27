// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import { GlobalSpecialEventReveal } from './GlobalSpecialEventReveal'

describe('special event cinematic',()=>{
  afterEach(()=>{cleanup();sessionStorage.clear()})
  it('shows artwork and description until this device presses CONTINUA',()=>{
    const tournament=createDemoTournament()
    tournament.globalEvents=[{id:'event-1',code:'por_tres',type:'challenge',title:'Por Tres',description:'Punto da fuori campo',status:'active',startedAt:new Date(Date.now()-6000).toISOString()}]
    render(<GlobalSpecialEventReveal tournament={tournament} audience="team"/>)
    expect(screen.getByRole('dialog',{name:'Evento speciale'})).toBeTruthy()
    expect(screen.getByAltText('Illustrazione Por Tres')).toBeTruthy()
    expect(screen.getByText('Punto da fuori campo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'CONTINUA'}))
    expect(screen.queryByRole('dialog',{name:'Evento speciale'})).toBeNull()
    expect(tournament.globalEvents[0].status).toBe('active')
  })
})
