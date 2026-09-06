import { describe, expect, it, vi } from 'vitest'
import { getLogoutRedirectTarget, signOutSupabaseSession } from './authLogout'

describe('auth logout', () => {
  it('calls Supabase signOut', async () => {
    const client = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    }

    await signOutSupabaseSession(client)

    expect(client.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('redirects to login after logout', () => {
    expect(getLogoutRedirectTarget()).toBe('/login')
  })

  it('surfaces signOut errors without swallowing them', async () => {
    const client = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: { message: 'Network error' } }),
      },
    }

    await expect(signOutSupabaseSession(client)).rejects.toThrow('Network error')
  })
})
