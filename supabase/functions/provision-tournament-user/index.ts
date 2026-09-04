import { corsHeaders, createAdminClient, generateReadablePassword, getCallerProfile, jsonResponse, requireTournamentAdmin, technicalEmail } from '../_shared/auth.ts'

type ProvisionRole = 'referee' | 'team' | 'court_display' | 'main_display'

type ProvisionInput = {
  tournamentId: string
  username?: string
  password?: string
  role?: ProvisionRole
  teamId?: string
  courtId?: string
  tournamentSlug?: string
  bulkTeams?: Array<{ teamId: string; username: string }>
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    const input = (await request.json()) as ProvisionInput
    const adminClient = createAdminClient()
    const caller = await getCallerProfile(request, adminClient)
    requireTournamentAdmin(caller, input.tournamentId)

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
          role: 'team',
          teamId: team.teamId,
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
  courtId?: string
}) {
  const username = input.username.trim().toLowerCase()
  const password = input.password || generateReadablePassword()
  const email = technicalEmail(username, input.tournamentSlug || Deno.env.get('AUTH_TOURNAMENT_SLUG') || input.tournamentName)

  if (input.role === 'team' && !input.teamId) throw new Error('teamId required for team account')
  if ((input.role === 'referee' || input.role === 'court_display') && !input.courtId) throw new Error('courtId required for court scoped account')

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
    display_name: username,
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
    courtId: input.courtId,
  }
}
