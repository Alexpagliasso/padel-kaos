import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AppRole = 'admin' | 'referee' | 'team' | 'court_display' | 'main_display'

export type Profile = {
  id: string
  tournament_id: string
  role: AppRole
  username: string
  display_name: string
  team_id: string | null
  court_id: string | null
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractSecretKey(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && 'value' in value) {
    const secretValue = (value as { value: unknown }).value
    if (typeof secretValue === 'string') return secretValue.trim()
  }
  return ''
}

function getServerSupabaseSecretKey() {
  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeysJson) {
    let secretKeys: unknown
    try {
      secretKeys = JSON.parse(secretKeysJson)
    } catch {
      throw new Error('Invalid SUPABASE_SECRET_KEYS configuration')
    }

    if (!secretKeys || typeof secretKeys !== 'object' || Array.isArray(secretKeys)) {
      throw new Error('Invalid SUPABASE_SECRET_KEYS configuration')
    }

    const defaultSecret = extractSecretKey((secretKeys as { default?: unknown }).default)
    if (defaultSecret) return defaultSecret
  }

  const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legacyServiceRoleKey) return legacyServiceRoleKey

  throw new Error('Missing server-side Supabase secret key')
}

export function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('Missing server Supabase configuration')
  const secretKey = getServerSupabaseSecretKey()

  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getCallerProfile(request: Request, adminClient: ReturnType<typeof createAdminClient>) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) throw new Error('not authenticated')

  const { data: userData, error: userError } = await adminClient.auth.getUser(token)
  if (userError || !userData.user) throw new Error('not authenticated')

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id,tournament_id,role,username,display_name,team_id,court_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) throw new Error('caller profile not configured')
  return profile as Profile
}

export function requireTournamentAdmin(profile: Profile, tournamentId: string) {
  if (profile.role !== 'admin' || profile.tournament_id !== tournamentId) {
    throw new Error('not authorized')
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function normalizeAuthSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function technicalEmail(username: string, tournamentSlug: string) {
  const normalizedUsername = normalizeAuthSlug(username)
  const normalizedTournament = normalizeAuthSlug(tournamentSlug)
  if (!normalizedUsername || !normalizedTournament) throw new Error('invalid username')
  return `${normalizedUsername}.${normalizedTournament}@auth.padelkaos.internal`
}

export function generateReadablePassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}
