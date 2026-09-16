import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type AppRole = 'admin' | 'referee' | 'team' | 'court_display' | 'main_display'
type ProvisionRole = 'referee' | 'team' | 'court_display' | 'main_display'

type Profile = {
  id: string
  tournament_id: string
  role: AppRole
  username: string
  display_name: string
  team_id: string | null
  court_id: string | null
}

type ProvisionInput = {
  tournamentId: string
  username?: string
  password?: string
  role?: ProvisionRole
  teamId?: string
  teamName?: string
  courtId?: string
  tournamentSlug?: string
  bulkTeams?: Array<{ teamId: string; teamName?: string; username: string }>
}

const corsHeaders = {
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

function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('Missing server Supabase configuration')
  return createClient(supabaseUrl, getServerSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getCallerProfile(request: Request, adminClient: ReturnType<typeof createAdminClient>) {
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

async function requireTournamentAdmin(
  profile: Profile,
  tournamentId: string,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  if (profile.role !== 'admin' || !profile.id || typeof tournamentId !== 'string' || !tournamentId.trim()) {
    throw new Error('not authorized')
  }
  const { data, error } = await adminClient.from('tournament_admins').select('user_id')
    .eq('tournament_id', tournamentId).eq('user_id', profile.id).maybeSingle()
  if (error) throw new Error('Unable to verify tournament admin membership')
  if (!data || data.user_id !== profile.id) throw new Error('not authorized')
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeAuthSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function technicalEmail(username: string, tournamentSlug: string) {
  const normalizedUsername = normalizeAuthSlug(username)
  const normalizedTournament = normalizeAuthSlug(tournamentSlug)
  if (!normalizedUsername || !normalizedTournament) throw new Error('invalid username')
  return `${normalizedUsername}.${normalizedTournament}@auth.padelkaos.internal`
}

function generateReadablePassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)
  try {
    const input = (await request.json()) as ProvisionInput
    const adminClient = createAdminClient()
    const caller = await getCallerProfile(request, adminClient)
    await requireTournamentAdmin(caller, input.tournamentId, adminClient)
    const { data: tournament, error: tournamentError } = await adminClient
      .from('tournaments').select('id,name').eq('id', input.tournamentId).single()
    if (tournamentError || !tournament) throw new Error('tournament not found')
    if (input.bulkTeams) {
      const credentials = []
      for (const team of input.bulkTeams) {
        credentials.push(await provisionOne({
          adminClient, tournamentId: input.tournamentId, tournamentName: tournament.name,
          tournamentSlug: input.tournamentSlug, username: team.username, role: 'team',
          teamId: team.teamId, teamName: team.teamName,
        }))
      }
      return jsonResponse({ credentials })
    }
    if (!input.username || !input.role) throw new Error('missing provisioning input')
    const credential = await provisionOne({
      adminClient, tournamentId: input.tournamentId, tournamentName: tournament.name,
      tournamentSlug: input.tournamentSlug, username: input.username, password: input.password,
      role: input.role, teamId: input.teamId, teamName: input.teamName, courtId: input.courtId,
    })
    return jsonResponse(credential)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'provisioning failed' }, 400)
  }
})

async function provisionOne(input: {
  adminClient: ReturnType<typeof createAdminClient>
  tournamentId: string
  tournamentName: string
  tournamentSlug?: string
  username: string
  password?: string
  role: ProvisionRole
  teamId?: string
  teamName?: string
  courtId?: string
}) {
  const username = input.username.trim().toLowerCase()
  const password = input.password?.trim() || generateReadablePassword()
  const email = technicalEmail(username, input.tournamentSlug || Deno.env.get('AUTH_TOURNAMENT_SLUG') || input.tournamentName)
  if (input.role === 'team' && !input.teamId) throw new Error('teamId required for team account')
  if ((input.role === 'referee' || input.role === 'court_display') && !input.courtId) throw new Error('courtId required for court scoped account')
  validatePassword(password)
  const { data: authUser, error: createError } = await input.adminClient.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username, tournament_id: input.tournamentId, role: input.role },
  })
  if (createError || !authUser.user) throw createError ?? new Error('auth user creation failed')
  const { error: profileError } = await input.adminClient.from('profiles').insert({
    id: authUser.user.id, tournament_id: input.tournamentId, role: input.role, username,
    display_name: input.teamName?.trim() || username, team_id: input.teamId ?? null,
    court_id: input.courtId ?? null,
  })
  if (profileError) {
    await input.adminClient.auth.admin.deleteUser(authUser.user.id)
    throw profileError
  }
  return {
    username, temporaryPassword: password, role: input.role, teamId: input.teamId,
    teamName: input.teamName, courtId: input.courtId,
  }
}

function validatePassword(password: string) {
  if (password.length < 10 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
    throw new Error('password must be at least 10 characters and contain one letter and one number')
  }
}
