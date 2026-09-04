import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase =
  supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Missing Supabase configuration')
  }
  return supabase
}
