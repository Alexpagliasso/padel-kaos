export type BrowserDeploymentEnv = {
  PROD: boolean
  VITE_DATA_PROVIDER?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_AUTH_TOURNAMENT_SLUG?: string
}

export function deploymentConfigError(env: BrowserDeploymentEnv): string | null {
  const provider = env.VITE_DATA_PROVIDER?.trim()
  if (provider !== 'demo' && provider !== 'supabase') {
    if (env.PROD) return 'Configurazione mancante: imposta VITE_DATA_PROVIDER=supabase su Vercel.'
    if (provider) return 'Configurazione non valida: VITE_DATA_PROVIDER deve essere demo o supabase.'
    return null // Local development retains its existing demo default.
  }
  if (env.PROD && provider !== 'supabase') {
    return 'Configurazione non valida: in produzione VITE_DATA_PROVIDER deve essere supabase.'
  }
  if (provider !== 'supabase') return null

  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  const slug = env.VITE_AUTH_TOURNAMENT_SLUG?.trim()
  if (!url || !key || !slug) {
    return 'Configurazione Supabase incompleta: imposta URL, chiave pubblicabile e slug del torneo.'
  }
  try {
    const parsed = new URL(url)
    if (!parsed.hostname || (env.PROD ? parsed.protocol !== 'https:' : !['http:', 'https:'].includes(parsed.protocol)) ||
      (env.PROD && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
      return 'VITE_SUPABASE_URL non è un URL valido per questo ambiente.'
    }
  } catch {
    return 'VITE_SUPABASE_URL non è un URL valido.'
  }
  if (!isPublicSupabaseKey(key)) {
    return 'VITE_SUPABASE_PUBLISHABLE_KEY deve contenere una chiave pubblicabile Supabase valida, mai una chiave segreta.'
  }
  return null
}

function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) {
    return key.length >= 30 && !/your[-_]?key|placeholder|example/i.test(key)
  }
  // Older projects can still use an anon JWT as the browser-safe key.
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    return payload.role === 'anon'
  } catch {
    return false
  }
}
