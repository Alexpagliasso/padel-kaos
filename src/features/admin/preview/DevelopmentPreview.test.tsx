import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../../auth/authContext'
import type { AppRole } from '../../auth/authIdentity'
import { AdminPreviewLinks, AdminRolePreviewRoute, DevelopmentBackToAdmin } from './DevelopmentPreview'
import { canUseDevelopmentPreview } from './previewPolicy'

vi.mock('../../../repositories', async importOriginal => ({ ...await importOriginal<object>(), dataProvider: 'supabase' }))

function auth(role: AppRole, status: AuthContextValue['status'] = 'authenticated'): AuthContextValue {
  return { status, session: null, profile: { id: 'user', username: 'test', displayName: 'Test', tournamentId: 'tournament', role }, signInWithUsername: vi.fn(), reauthenticateForReset: vi.fn(), logout: vi.fn(), refreshProfile: vi.fn() }
}
function back(role: AppRole, dev: boolean, status?: AuthContextValue['status']) {
  return renderToStaticMarkup(<AuthContext.Provider value={auth(role, status)}><MemoryRouter initialEntries={['/player']}><DevelopmentBackToAdmin development={dev} /></MemoryRouter></AuthContext.Provider>)
}
describe('development role previews', () => {
  it('admin sees all four preview links', () => {
    const html = renderToStaticMarkup(<AuthContext.Provider value={auth('admin')}><MemoryRouter><AdminPreviewLinks /></MemoryRouter></AuthContext.Provider>)
    for (const path of ['/player', '/referee', '/court-display', '/main-display']) expect(html).toContain(`href="${path}"`)
  })
  it('shows Back to Admin only for authenticated admins in development', () => {
    expect(back('admin', true)).toContain('Back to Admin')
    expect(back('admin', false)).not.toContain('Back to Admin')
    expect(back('admin', true, 'unauthenticated')).not.toContain('Back to Admin')
    expect(back('admin', true, 'loading')).not.toContain('Back to Admin')
  })
  it('allows authenticated admin preview through ProtectedRoute, without admitting other roles', () => {
    const renderGuard = (role: AppRole, status: AuthContextValue['status'] = 'authenticated') => renderToStaticMarkup(
      <AuthContext.Provider value={auth(role, status)}><MemoryRouter initialEntries={['/referee']}><AdminRolePreviewRoute allowedRoles={['referee']}><p>Protected referee preview</p></AdminRolePreviewRoute></MemoryRouter></AuthContext.Provider>,
    )
    expect(renderGuard('admin')).toContain('Protected referee preview')
    expect(renderGuard('referee')).toContain('Protected referee preview')
    expect(renderGuard('team')).not.toContain('Protected referee preview')
    expect(renderGuard('admin', 'unauthenticated')).not.toContain('Protected referee preview')
  })
  it.each(['team', 'referee', 'court_display', 'main_display'] as const)('never renders cross-role navigation for %s', role => {
    expect(back(role, true)).not.toContain('Back to Admin')
    const html = renderToStaticMarkup(<AuthContext.Provider value={auth(role)}><MemoryRouter><AdminPreviewLinks /></MemoryRouter></AuthContext.Provider>)
    expect(html).toBe('')
    expect(canUseDevelopmentPreview(true, 'authenticated', role)).toBe(false)
  })
})
