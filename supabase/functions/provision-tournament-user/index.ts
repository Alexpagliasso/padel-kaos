import { corsHeaders, createAdminClient, generateReadablePassword, getCallerProfile, jsonResponse, requireTournamentAdmin, technicalEmail } from '../_shared/auth.ts'
import { cleanupTournamentAuth } from './cleanup.ts'

type ProvisionRole = 'referee' | 'team' | 'court_display' | 'main_display'

type ProvisionInput = {
  action?: 'provision' | 'cleanup_tournament_auth'
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    const input = (await request.json()) as ProvisionInput
    const adminClient = createAdminClient()
    const caller = await getCallerProfile(request, adminClient)
    await requireTournamentAdmin(caller, input.tournamentId, adminClient)

    if (input.action === 'cleanup_tournament_auth') {
      const result = await cleanupTournamentAuth(input.tournamentId, caller.id, {
        getTournamentStatus: async (tournamentId) => {
          const { data, error } = await adminClient.from('tournaments').select('status').eq('id', tournamentId).single()
          if (error || !data) throw new Error('tournament not found')
          return data.status
        },
        listProfiles: async (tournamentId) => {
          const { data, error } = await adminClient.from('profiles').select('id,role')
            .eq('tournament_id', tournamentId).in('role', ['team', 'referee', 'court_display', 'main_display'])
          if (error) throw error
          return data ?? []
        },
        deleteAuthUser: async (userId) => {
          const { error } = await adminClient.auth.admin.deleteUser(userId)
          return { error }
        },
        deleteProfile: async (userId, tournamentId) => {
          const { error } = await adminClient.from('profiles').delete().eq('id', userId)
            .eq('tournament_id', tournamentId).in('role', ['team', 'referee', 'court_display', 'main_display'])
          if (error) throw error
        },
      })
      return jsonResponse(result)
    }
    if (input.action && input.action !== 'provision') throw new Error('invalid action')

    const { data: tournament, error: tournamentError } = await adminClient
      .from('tournaments')
      .select('id,name')
      .eq('id', input.tournamentId)
      .single()

    if (tournamentError || !tournament) throw new Error('tournament not found')

    if (input.bulkTeams) {
      const credentials = []
      for (const team of input.bulkTeams) {
        credentials.push(await provisionOne({
          adminClient,
          tournamentId: input.tournamentId,
          tournamentName: tournament.name,
          tournamentSlug: input.tournamentSlug,
          username: team.username,
          password: input.password,
          role: 'team',
          teamId: team.teamId,
          teamName: team.teamName,
        }))
      }
      return jsonResponse({ credentials })
    }

    if (!input.username || !input.role) throw new Error('missing provisioning input')

    const credential = await provisionOne({
      adminClient,
      tournamentId: input.tournamentId,
      tournamentName: tournament.name,
      tournamentSlug: input.tournamentSlug,
      username: input.username,
      password: input.password,
      role: input.role,
      teamId: input.teamId,
      teamName: input.teamName,
      courtId: input.courtId,
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
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      tournament_id: input.tournamentId,
      role: input.role,
    },
  })

  if (createError || !authUser.user) throw createError ?? new Error('auth user creation failed')

  const { error: profileError } = await input.adminClient.from('profiles').insert({
    id: authUser.user.id,
    tournament_id: input.tournamentId,
    role: input.role,
    username,
    display_name: input.teamName?.trim() || username,
    team_id: input.teamId ?? null,
    court_id: input.courtId ?? null,
  })

  if (profileError) {
    await input.adminClient.auth.admin.deleteUser(authUser.user.id)
    throw profileError
  }

  return {
    username,
    temporaryPassword: password,
    role: input.role,
    teamId: input.teamId,
    teamName: input.teamName,
    courtId: input.courtId,
  }
}

function validatePassword(password: string) {
  if (password.length < 10 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
    throw new Error('password must be at least 10 characters and contain one letter and one number')
  }
}
