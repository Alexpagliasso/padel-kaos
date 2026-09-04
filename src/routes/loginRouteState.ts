export function isLoginSubmitDisabled(submitting: boolean, status: string) {
  return submitting || status === 'loading'
}

export function getLoginButtonLabel(submitting: boolean) {
  return submitting ? 'Accesso in corso...' : 'Sign in'
}
