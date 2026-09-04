import { describe, expect, it } from 'vitest'
import { getLoginButtonLabel, isLoginSubmitDisabled } from './loginRouteState'

describe('LoginRoute helpers', () => {
  it('disables submit while loading or submitting', () => {
    expect(isLoginSubmitDisabled(true, 'unauthenticated')).toBe(true)
    expect(isLoginSubmitDisabled(false, 'loading')).toBe(true)
    expect(isLoginSubmitDisabled(false, 'unauthenticated')).toBe(false)
  })

  it('shows visible loading feedback while submitting', () => {
    expect(getLoginButtonLabel(true)).toBe('Accesso in corso...')
    expect(getLoginButtonLabel(false)).toBe('Sign in')
  })
})
