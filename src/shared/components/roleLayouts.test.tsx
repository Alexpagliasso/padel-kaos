import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../../features/auth/AuthProvider'
import { TournamentThemeProvider } from '../../theme/ThemeProvider'
import { PlayerRoute } from '../../routes/PlayerRoute'
import { RefereeRoute } from '../../routes/RefereeRoute'
import { CourtDisplayRoute } from '../../routes/CourtDisplayRoute'
import { MainDisplayRoute } from '../../routes/MainDisplayRoute'
import { AdminLayout } from '../../features/admin/layout/AdminLayout'
vi.mock('../../repositories', async importOriginal => ({ ...await importOriginal<object>(), dataProvider: 'demo' }))

function renderPage(Page: typeof PlayerRoute) {
  return renderToStaticMarkup(<TournamentThemeProvider><QueryClientProvider client={new QueryClient()}><AuthProvider><MemoryRouter><Page /></MemoryRouter></AuthProvider></QueryClientProvider></TournamentThemeProvider>)
}
describe('role layout isolation, including demo admin profile', () => {
  it.each([['player', PlayerRoute], ['referee', RefereeRoute], ['court', CourtDisplayRoute], ['main', MainDisplayRoute]] as const)('%s has no admin or cross-role links', (_, Page) => {
    const html = renderPage(Page)
    expect(html).not.toContain('Admin navigation')
    for (const route of ['/admin', '/referee', '/court-display', '/main-display']) expect(html).not.toContain(`href="${route}`)
  })
  it.each([CourtDisplayRoute, MainDisplayRoute])('display contains no navigation or operational controls', Page => {
    const html = renderPage(Page)
    expect(html).not.toMatch(/<(nav|button|select)\b/)
    expect(html).toContain('scoreboard')
  })
  it('admin has its sidebar and appearance link', () => {
    const html = renderPage(AdminLayout)
    expect(html).toContain('Admin navigation')
    expect(html).toContain('href="/admin/appearance"')
    expect(html).toContain('MuiDrawer')
  })
})
