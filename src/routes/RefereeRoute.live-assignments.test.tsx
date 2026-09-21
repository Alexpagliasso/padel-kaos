// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createDemoTournament } from '../demo/demoSeed'
import { RefereeAssignedCourtsView } from './RefereeRoute'

afterEach(() => { cleanup(); sessionStorage.clear() })

describe('live referee assignment changes', () => {
  it('adds a selector, falls back after removal, and removes controls with zero courts', () => {
    const tournament = createDemoTournament()
    const [first, second] = tournament.courts
    const client = new QueryClient()
    const view = (courtIds: string[]) => createElement(QueryClientProvider, { client },
      createElement(RefereeAssignedCourtsView, { tournament, courtIds, refereeId: 'referee-live-test' }))

    const rendered = render(view([first.id]))
    expect(screen.queryByLabelText('Campo assegnato')).toBeNull()

    rendered.rerender(view([first.id, second.id]))
    expect(screen.getByLabelText('Campo assegnato')).toBeTruthy()

    rendered.rerender(view([second.id]))
    expect(screen.queryByLabelText('Campo assegnato')).toBeNull()
    expect(screen.getAllByText(second.name).length).toBeGreaterThan(0)

    rendered.rerender(view([]))
    expect(screen.getByText('NESSUN CAMPO ASSEGNATO')).toBeTruthy()
    expect(screen.queryByText('AVVIA SET')).toBeNull()
  })
})
