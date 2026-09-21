import { createClient } from '@supabase/supabase-js'
import { deploymentConfigError } from '../../app/deploymentConfig'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase =
  !deploymentConfigError(import.meta.env) &&
  (import.meta.env.PROD || import.meta.env.VITE_DATA_PROVIDER === 'supabase') &&
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Configurazione Supabase mancante o non valida')
  }
  return supabase
}
