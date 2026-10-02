import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ProvisionRole = 'referee' | 'team' | 'court_display' | 'main_display'
type AppRole = 'admin' | ProvisionRole
type Profile = {id:string;tournament_id:string;role:AppRole;username:string;display_name:string;team_id:string|null;court_id:string|null}
type CleanupProfile = {id:string;role:AppRole}
type CleanupFailure = {phase:'profile_dependencies'|'auth_delete'|'profile_delete';code:string}
type CleanupResult = {deleted:number;alreadyMissing:number;failed:number;failures?:CleanupFailure[]}
type TournamentDeletionResult = CleanupResult & {storageDeleted:number;tournamentDeleted:boolean}
type CleanupDependencies = {
  getTournamentStatus:(tournamentId:string)=>Promise<string>
  listProfiles:(tournamentId:string)=>Promise<CleanupProfile[]>
  clearProfileDependencies:(userId:string,tournamentId:string)=>Promise<void>
  deleteAuthUser:(userId:string)=>Promise<{error?:{message?:string;status?:number}|null}>
  deleteProfile:(userId:string,tournamentId:string)=>Promise<void>
}
type TournamentDeletionDependencies = CleanupDependencies & {deleteStorage:(tournamentId:string)=>Promise<number>;deleteTournament:(tournamentId:string)=>Promise<void>}

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const operationalRoles=new Set<string>(['team','referee','court_display','main_display'])

function extractSecretKey(value:unknown){if(typeof value==='string')return value.trim();if(value&&typeof value==='object'&&'value'in value){const secret=(value as {value:unknown}).value;if(typeof secret==='string')return secret.trim()}return''}
function getServerSupabaseSecretKey(){const configured=Deno.env.get('SUPABASE_SECRET_KEYS');if(configured){let parsed:unknown;try{parsed=JSON.parse(configured)}catch{throw new Error('Invalid SUPABASE_SECRET_KEYS configuration')}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid SUPABASE_SECRET_KEYS configuration');const secret=extractSecretKey((parsed as {default?:unknown}).default);if(secret)return secret}const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();if(legacy)return legacy;throw new Error('Missing server-side Supabase secret key')}
function createAdminClient(){const url=Deno.env.get('SUPABASE_URL');if(!url)throw new Error('Missing server Supabase configuration');return createClient(url,getServerSupabaseSecretKey(),{auth:{autoRefreshToken:false,persistSession:false}})}
async function getCallerProfile(request:Request,adminClient:ReturnType<typeof createAdminClient>){const token=request.headers.get('Authorization')?.replace('Bearer ','');if(!token)throw new Error('not authenticated');const{data:userData,error:userError}=await adminClient.auth.getUser(token);if(userError||!userData.user)throw new Error('not authenticated');const{data,error}=await adminClient.from('profiles').select('id,tournament_id,role,username,display_name,team_id,court_id').eq('id',userData.user.id).single();if(error||!data)throw new Error('caller profile not configured');return data as Profile}
async function requireTournamentAdmin(profile:Profile,tournamentId:string,adminClient:ReturnType<typeof createAdminClient>){if(profile.role!=='admin'||!profile.id||typeof tournamentId!=='string'||!tournamentId.trim())throw new Error('not authorized');const{data,error}=await adminClient.from('tournament_admins').select('user_id').eq('tournament_id',tournamentId).eq('user_id',profile.id).maybeSingle();if(error)throw new Error('Unable to verify tournament admin membership');if(!data||data.user_id!==profile.id)throw new Error('not authorized')}
function jsonResponse(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function normalizeAuthSlug(value:string){return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function technicalEmail(username:string,tournamentSlug:string){const user=normalizeAuthSlug(username),tournament=normalizeAuthSlug(tournamentSlug);if(!user||!tournament)throw new Error('invalid username');return `${user}.${tournament}@auth.padelkaos.internal`}
function generateReadablePassword(length=14){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%',bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return[...bytes].map(byte=>alphabet[byte%alphabet.length]).join('')}
function isMissingUser(error:{message?:string;status?:number}){return error.status===404||/user not found|user does not exist/i.test(error.message??'')}
function errorDiagnostic(error:unknown){const candidate=error as {code?:unknown;status?:unknown;message?:unknown};return{code:String(candidate?.code??candidate?.status??'unknown'),message:String(candidate?.message??error??'unknown error')}}
function recordCleanupFailure(tournamentId:string,userId:string,phase:CleanupFailure['phase'],error:unknown,failures:CleanupFailure[]){const diagnostic=errorDiagnostic(error);console.error('tournament_auth_cleanup_failed',{tournamentId,userId,phase,code:diagnostic.code,message:diagnostic.message});failures.push({phase,code:diagnostic.code})}
export async function cleanupTournamentAuth(tournamentId:string,callerId:string,dependencies:CleanupDependencies):Promise<CleanupResult>{const status=await dependencies.getTournamentStatus(tournamentId);if(status!=='draft'&&status!=='configured')throw new Error('tournament deletion locked after start');const profiles=await dependencies.listProfiles(tournamentId),failures:CleanupFailure[]=[],result:CleanupResult={deleted:0,alreadyMissing:0,failed:0,failures};for(const profile of profiles){if(profile.id===callerId||!operationalRoles.has(profile.role))continue;try{await dependencies.clearProfileDependencies(profile.id,tournamentId)}catch(error){result.failed+=1;recordCleanupFailure(tournamentId,profile.id,'profile_dependencies',error,failures);continue}let authMissing:boolean;try{const{error}=await dependencies.deleteAuthUser(profile.id);if(error&&!isMissingUser(error)){result.failed+=1;recordCleanupFailure(tournamentId,profile.id,'auth_delete',error,failures);continue}authMissing=Boolean(error)}catch(error){result.failed+=1;recordCleanupFailure(tournamentId,profile.id,'auth_delete',error,failures);continue}try{await dependencies.deleteProfile(profile.id,tournamentId);if(authMissing)result.alreadyMissing+=1;else result.deleted+=1}catch(error){result.failed+=1;recordCleanupFailure(tournamentId,profile.id,'profile_delete',error,failures)}}if(!failures.length)delete result.failures;return result}
export async function deleteTournamentPermanently(tournamentId:string,callerId:string,forceActive:boolean,dependencies:TournamentDeletionDependencies):Promise<TournamentDeletionResult>{const status=await dependencies.getTournamentStatus(tournamentId);if(!forceActive&&!['draft','configured'].includes(status))throw new Error('active tournament confirmation required');const cleanup=await cleanupTournamentAuth(tournamentId,callerId,{...dependencies,getTournamentStatus:async()=>forceActive?'configured':status});if(cleanup.failed>0)return{...cleanup,storageDeleted:0,tournamentDeleted:false};const storageDeleted=await dependencies.deleteStorage(tournamentId);await dependencies.deleteTournament(tournamentId);return{...cleanup,storageDeleted,tournamentDeleted:true}}

async function clearTournamentProfileDependencies(adminClient:ReturnType<typeof createAdminClient>,userId:string,tournamentId:string){
  const {data:shared,error:sharedError}=await adminClient.from('tournament_admins').select('tournament_id').eq('user_id',userId).neq('tournament_id',tournamentId).limit(1).maybeSingle()
  if(sharedError)throw sharedError
  if(shared)throw Object.assign(new Error('auth user is shared with another tournament'),{code:'shared_auth_user'})
  const {data:matches,error:matchError}=await adminClient.from('matches').select('id').eq('tournament_id',tournamentId)
  if(matchError)throw matchError
  const matchIds=(matches??[]).map(match=>match.id)
  const {data:events,error:eventError}=await adminClient.from('global_events').select('id').eq('tournament_id',tournamentId)
  if(eventError)throw eventError
  const eventIds=(events??[]).map(event=>event.id)
  const check=async(operation:PromiseLike<{error:unknown}>)=>{const{error}=await operation;if(error)throw error}
  await check(adminClient.from('match_events').update({actor_user_id:null}).eq('tournament_id',tournamentId).eq('actor_user_id',userId))
  await check(adminClient.from('tournament_events').update({actor_user_id:null}).eq('tournament_id',tournamentId).eq('actor_user_id',userId))
  await check(adminClient.from('tournament_backups').update({created_by:null}).eq('tournament_id',tournamentId).eq('created_by',userId))
  await check(adminClient.from('matches').update({score_updated_by:null}).eq('tournament_id',tournamentId).eq('score_updated_by',userId))
  await check(adminClient.from('matches').update({result_confirmed_by:null}).eq('tournament_id',tournamentId).eq('result_confirmed_by',userId))
  await check(adminClient.from('global_event_winner_reports').delete().eq('tournament_id',tournamentId).eq('reported_by',userId))
  await check(adminClient.from('global_event_winner_reports').update({resolved_by:null}).eq('tournament_id',tournamentId).eq('resolved_by',userId))
  if(matchIds.length){await check(adminClient.from('card_usages').update({requested_by:null}).in('match_id',matchIds).eq('requested_by',userId));await check(adminClient.from('card_usages').update({confirmed_by:null}).in('match_id',matchIds).eq('confirmed_by',userId))}
  if(eventIds.length)await check(adminClient.from('global_event_winners').update({awarded_by:null}).in('global_event_id',eventIds).eq('awarded_by',userId))
}

type ProvisionInput = {
  action?: 'provision' | 'reset_password' | 'cleanup_tournament_auth' | 'delete_tournament'
  tournamentId: string
  userId?: string
  username?: string
  password?: string
  role?: ProvisionRole
  teamId?: string
  teamName?: string
  courtId?: string
  tournamentSlug?: string
  bulkTeams?: Array<{ teamId: string; teamName?: string; username: string }>
  forceActive?: boolean
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    const input = (await request.json()) as ProvisionInput
    const adminClient = createAdminClient()
    const caller = await getCallerProfile(request, adminClient)
    await requireTournamentAdmin(caller, input.tournamentId, adminClient)

    if (input.action === 'reset_password') {
      if (!input.userId) throw new Error('missing account id')
      const { data: target, error: targetError } = await adminClient.from('profiles')
        .select('id,role,username,display_name,team_id,court_id')
        .eq('id', input.userId).eq('tournament_id', input.tournamentId).neq('role', 'admin').single()
      if (targetError || !target || !operationalRoles.has(target.role)) throw new Error('account not found')
      const temporaryPassword = generateReadablePassword()
      const { error: updateError } = await adminClient.auth.admin.updateUserById(target.id, { password: temporaryPassword })
      if (updateError) throw updateError
      return jsonResponse({
        username: target.username,
        temporaryPassword,
        role: target.role,
        teamId: target.team_id ?? undefined,
        teamName: target.display_name,
        courtId: target.court_id ?? undefined,
      })
    }

    if (input.action === 'delete_tournament') {
      const dependencies = {
        getTournamentStatus: async (tournamentId:string) => {
          const {data,error}=await adminClient.from('tournaments').select('status').eq('id',tournamentId).single()
          if(error||!data) throw new Error('tournament not found')
          return data.status
        },
        listProfiles: async (tournamentId:string) => {
          const {data,error}=await adminClient.from('profiles').select('id,role').eq('tournament_id',tournamentId)
          if(error) throw error
          return data??[]
        },
        clearProfileDependencies: async (userId:string,tournamentId:string) => clearTournamentProfileDependencies(adminClient,userId,tournamentId),
        deleteAuthUser: async (userId:string) => {const {error}=await adminClient.auth.admin.deleteUser(userId);return {error}},
        deleteProfile: async (userId:string,tournamentId:string) => {const {error}=await adminClient.from('profiles').delete().eq('id',userId).eq('tournament_id',tournamentId).neq('role','admin');if(error)throw error},
        deleteStorage: async (tournamentId:string) => {
          const bucket=adminClient.storage.from('dice-effect-images')
          const paths:string[]=[]
          const collect=async(prefix:string):Promise<void>=>{
            let offset=0
            while(true){
              const {data,error}=await bucket.list(prefix,{limit:1000,offset})
              if(error){if(/not found/i.test(error.message))return;throw error}
              for(const item of data??[]){const path=`${prefix}/${item.name}`;if(item.id)paths.push(path);else await collect(path)}
              if((data??[]).length<1000)break
              offset+=1000
            }
          }
          await collect(tournamentId)
          for(let offset=0;offset<paths.length;offset+=100){const batch=paths.slice(offset,offset+100);const {error}=await bucket.remove(batch);if(error)throw error}
          return paths.length
        },
        deleteTournament: async (tournamentId:string) => {
          const {data:admins,error:adminError}=await adminClient.from('profiles').select('id').eq('tournament_id',tournamentId).eq('role','admin')
          if(adminError)throw adminError
          for(const admin of admins??[]){const {data:membership}=await adminClient.from('tournament_admins').select('tournament_id').eq('user_id',admin.id).neq('tournament_id',tournamentId).limit(1).maybeSingle();const {error}=await adminClient.from('profiles').update({tournament_id:membership?.tournament_id??null}).eq('id',admin.id);if(error)throw error}
          const {data,error}=await adminClient.from('tournaments').delete().eq('id',tournamentId).select('id').maybeSingle()
          if(error)throw error
          if(!data)throw new Error('tournament was not deleted')
        },
      }
      const result=await deleteTournamentPermanently(input.tournamentId,caller.id,Boolean(input.forceActive),dependencies)
      return jsonResponse(result,result.tournamentDeleted?200:409)
    }

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
        clearProfileDependencies: async (userId, tournamentId) => clearTournamentProfileDependencies(adminClient, userId, tournamentId),
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
