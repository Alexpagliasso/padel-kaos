import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createDemoTournament } from '../demo/demoSeed'
import { RefereeAssignedCourtsView } from './RefereeRoute'
import { refereeCourtStorageKey, resolveRefereeCourt } from './refereeCourtSelection'

describe('multi-court referee routing', () => {
  it('opens the only assigned court directly', () => {
    const tournament = createDemoTournament()
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RefereeAssignedCourtsView, {
      tournament,
      courtIds: [tournament.courts[0].id],
      headerAction: createElement('button', null, 'Esci'),
    })))
    expect(html).not.toContain('Seleziona campo')
    expect(html).toContain(tournament.courts[0].name)
    expect(html).toContain('Esci')
  })

  it('shows an Italian court selector for multiple assigned courts', () => {
    const tournament = createDemoTournament()
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RefereeAssignedCourtsView, { tournament, courtIds: tournament.courts.slice(0, 2).map((court) => court.id) })))
    expect(html).toContain('Campo assegnato')
    expect(html).toContain(tournament.courts[0].name)
    expect(html).toContain(tournament.courts[1].name)
  })

  it('keeps the logout action visible in the multi-court selector', () => {
    const tournament = createDemoTournament()
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RefereeAssignedCourtsView, {
      tournament,
      courtIds: tournament.courts.slice(0, 2).map((court) => court.id),
      headerAction: createElement('button', null, 'Esci'),
    })))

    expect(html).toContain('Campo assegnato')
    expect(html).toContain('Esci')
  })

  it('restores only assigned courts and falls back after removal', () => {
    expect(resolveRefereeCourt(['a', 'b'], 'b')).toBe('b')
    expect(resolveRefereeCourt(['a'], 'b')).toBe('a')
    expect(resolveRefereeCourt(['a', 'b'], 'unauthorized')).toBe('a')
    expect(refereeCourtStorageKey('t', 'r')).toContain('t:r')
  })

  it('shows a safe empty state without match controls when all assignments are removed', () => {
    const tournament = createDemoTournament()
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RefereeAssignedCourtsView, {
      tournament,
      courtIds: [],
    })))
    expect(html).toContain('NESSUN CAMPO ASSEGNATO')
    expect(html).toContain('La Regia non ti ha ancora assegnato un campo.')
    expect(html).not.toContain('AVVIA SET')
  })
})
