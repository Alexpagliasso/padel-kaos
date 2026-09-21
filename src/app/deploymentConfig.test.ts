import { describe, expect, it } from 'vitest'
import { deploymentConfigError, type BrowserDeploymentEnv } from './deploymentConfig'

const configured: BrowserDeploymentEnv = {
  PROD: true,
  VITE_DATA_PROVIDER: 'supabase',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
  VITE_AUTH_TOURNAMENT_SLUG: 'padel-kaos',
}

describe('deployment configuration', () => {
  it('accepts browser-safe production Supabase configuration', () => {
    expect(deploymentConfigError(configured)).toBeNull()
  })

  it('never permits demo or an implicit demo fallback in production', () => {
    expect(deploymentConfigError({ ...configured, VITE_DATA_PROVIDER: 'demo' })).toContain('supabase')
    expect(deploymentConfigError({ ...configured, VITE_DATA_PROVIDER: undefined })).toContain('VITE_DATA_PROVIDER')
  })

  it('rejects absent or malformed Supabase settings without exposing key values', () => {
    expect(deploymentConfigError({ ...configured, VITE_SUPABASE_URL: '' })).toContain('incompleta')
    expect(deploymentConfigError({ ...configured, VITE_SUPABASE_URL: 'http://localhost:54321' })).toContain('URL')
    expect(deploymentConfigError({ ...configured, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' })).toContain('pubblicabile')
    expect(deploymentConfigError({ ...configured, VITE_SUPABASE_PUBLISHABLE_KEY: 'invalid-key' })).toContain('valida')
  })

  it('preserves the local demo default', () => {
    expect(deploymentConfigError({ PROD: false })).toBeNull()
  })
})
