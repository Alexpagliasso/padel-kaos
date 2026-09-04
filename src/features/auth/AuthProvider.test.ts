import { describe, expect, it, vi } from 'vitest'
import { signInWithUsernamePassword } from './authSignIn'
import type { AppProfile } from './authIdentity'

const adminProfile: AppProfile = {
  id: 'admin-user-id',
  tournamentId: 'tournament-id',
  role: 'admin',
  username: 'admin',
  displayName: 'Admin',
}

function createAuthClient(input: {
  userId?: string
  errorMessage?: string
}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: input.errorMessage ? null : { id: input.userId ?? adminProfile.id },
          session: input.errorMessage ? null : { access_token: 'test-token' },
        },
        error: input.errorMessage ? { message: input.errorMessage } : null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  } as unknown as Parameters<typeof signInWithUsernamePassword>[0]
}

describe('signInWithUsernamePassword', () => {
  it('submits username login with the technical email and redirects admin users', async () => {
    const client = createAuthClient({})
    const loadProfile = vi.fn().mockResolvedValue(adminProfile)

    const result = await signInWithUsernamePassword(client, 'admin', 'secret-password', loadProfile)

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin.padel-kaos@auth.padelkaos.internal',
      password: 'secret-password',
    })
    expect(loadProfile).toHaveBeenCalledWith(adminProfile.id)
    expect(result).toMatchObject({ ok: true, redirectTo: '/admin' })
  })

  it('returns a readable auth error without loading a profile', async () => {
    const client = createAuthClient({ errorMessage: 'Invalid login credentials' })
    const loadProfile = vi.fn()

    const result = await signInWithUsernamePassword(client, 'admin', 'wrong-password', loadProfile)

    expect(result).toEqual({ ok: false, message: 'Invalid login credentials' })
    expect(loadProfile).not.toHaveBeenCalled()
  })

  it('signs out and returns a readable error when the profile is missing', async () => {
    const client = createAuthClient({})

    const result = await signInWithUsernamePassword(client, 'admin', 'secret-password', async () => null)

    expect(client.auth.signOut).toHaveBeenCalled()
    expect(result).toEqual({ ok: false, message: 'Profile not configured' })
  })
})
