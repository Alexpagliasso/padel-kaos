// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from './authContext'
import type { AppProfile } from './authIdentity'
import { LogoutButton } from './LogoutButton'

afterEach(cleanup)

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
    ['admin', 'Admin User', 'Admin'],
    ['team', 'Team Red', 'Squadra'],
    ['referee', 'Referee Test', 'Arbitro'],
    ['court_display', 'Court Display', 'Schermo campo'],
    ['main_display', 'Main Display', 'Schermo principale'],
  ] as const)('renders user info and logout for %s', (role, displayName, roleLabel) => {
    const html = renderLogout({
      id: `${role}-id`,
      tournamentId: 'tournament-id',
      role,
      username: `${role}_test`,
      displayName,
    })

    expect(html).toContain(displayName)
    expect(html).toContain(roleLabel)
    expect(html).toContain('Esci')
    expect(html).not.toContain('@auth.padelkaos.internal')
  })

  it.each([
    ['team', 'Team Red'],
    ['referee', 'Arbitro Uno'],
  ] as const)('logs out %s accounts and replaces the route with /login', async (role, displayName) => {
    const logout = vi.fn().mockResolvedValue(undefined)
    const profile: AppProfile = {
      id: `${role}-id`, tournamentId: 'tournament-id', role,
      username: `${role}_test`, displayName,
    }

    render(
      <AuthContext.Provider value={{
        status: 'authenticated', session: null, profile,
        signInWithUsername: vi.fn(), reauthenticateForReset: vi.fn(), logout, refreshProfile: vi.fn(),
      }}>
        <MemoryRouter initialEntries={[role === 'team' ? '/player' : '/referee']}>
          <Routes>
            <Route path="*" element={<LogoutButton minimal />} />
            <Route path="/login" element={<p>Pagina di accesso</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Esci' }))
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Pagina di accesso')).toBeTruthy()
  })
})
