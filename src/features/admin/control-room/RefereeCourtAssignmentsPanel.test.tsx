import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../../demo/demoSeed'
import { RefereeCourtAssignmentsPanel } from './RefereeCourtAssignmentsPanel'

describe('Regia referee assignment panel', () => {
  it('lists every court and highlights uncovered courts', () => {
    const tournament = createDemoTournament()
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(RefereeCourtAssignmentsPanel, { tournament })))
    expect(html).toContain('ARBITRI E CAMPI')
    for (const court of tournament.courts) expect(html).toContain(court.name)
    expect(html).toContain('NON ASSEGNATO')
    expect(html).toContain('CAMPI SENZA ARBITRO')
  })
})
