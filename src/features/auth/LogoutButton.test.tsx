import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from './authContext'
import type { AppProfile } from './authIdentity'
import { LogoutButton } from './LogoutButton'

function renderLogout(profile: AppProfile) {
  const html = renderToStaticMarkup(
    <AuthContext.Provider
      value={{
        status: 'authenticated',
        session: null,
        profile,
        signInWithUsername: vi.fn(),
        reauthenticateForReset: vi.fn(),
        logout: vi.fn(),
        refreshProfile: vi.fn(),
      }}
    >
      <MemoryRouter>
        <LogoutButton />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return html
}

describe('LogoutButton', () => {
  it.each([
    ['admin', 'Admin User'],
    ['team', 'Team Red'],
    ['referee', 'Referee Test'],
    ['court_display', 'Court Display'],
    ['main_display', 'Main Display'],
  ] as const)('renders user info and logout for %s', (role, displayName) => {
    const html = renderLogout({
      id: `${role}-id`,
      tournamentId: 'tournament-id',
      role,
      username: `${role}_test`,
      displayName,
    })

    expect(html).toContain(displayName)
    expect(html).toContain(role)
    expect(html).toContain('Logout')
    expect(html).not.toContain('@auth.padelkaos.internal')
  })
})
