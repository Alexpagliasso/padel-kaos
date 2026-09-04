import { corsHeaders, createAdminClient, getCallerProfile, jsonResponse, requireTournamentAdmin } from '../_shared/auth.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    const input = (await request.json()) as { tournamentId: string }
    const adminClient = createAdminClient()
    const caller = await getCallerProfile(request, adminClient)
    requireTournamentAdmin(caller, input.tournamentId)

    const { data: profiles, error } = await adminClient
      .from('profiles')
      .select('id,role')
      .eq('tournament_id', input.tournamentId)
      .neq('role', 'admin')

    if (error) throw error

    const deletedUserIds: string[] = []
    for (const profile of profiles ?? []) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(profile.id)
      if (deleteError) throw deleteError
      deletedUserIds.push(profile.id)
    }

    await adminClient.from('profiles').delete().eq('tournament_id', input.tournamentId).neq('role', 'admin')

    return jsonResponse({ deletedUserIds })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'cleanup failed' }, 400)
  }
})
