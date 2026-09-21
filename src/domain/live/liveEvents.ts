import type { GlobalEvent, MatchEvent, MatchEventType, Tournament, TournamentEvent } from '../../shared/types/domain'

export type LiveAudience = 'admin' | 'referee' | 'team' | 'court_display' | 'main_display'
export type LiveEventCategory = 'STATE_ONLY' | 'INFORMATION' | 'ATTENTION' | 'ACTION_REQUIRED' | 'SHOW_EVENT'
export type LivePresentation = {
  id: string
  category: LiveEventCategory
  priority: number
  title: string
  detail?: string
  matchId?: string
  roundId?: string
  createdAt: string
  expiresAfterMs: number
}

const categoryByType: Partial<Record<MatchEventType, LiveEventCategory>> = {
  GAME_WON: 'STATE_ONLY', SCORE_CORRECTED: 'STATE_ONLY',
  SET_1_STARTED: 'INFORMATION', SET_2_STARTED: 'INFORMATION', ROUND_STARTED: 'INFORMATION',
  SET_WON: 'ATTENTION', TIME_EXPIRED: 'ACTION_REQUIRED', SET_RESULT_SUBMITTED: 'ATTENTION',
  SUPER_TIEBREAK_REQUIRED: 'ACTION_REQUIRED', MATCH_COMPLETED: 'ATTENTION', ROUND_COMPLETED: 'ATTENTION',
  CARD_PLAYED: 'ACTION_REQUIRED', CARD_ACTIVATED: 'INFORMATION', CARD_REJECTED: 'INFORMATION',
  DICE_ROLLED: 'SHOW_EVENT', SPECIAL_EVENT: 'SHOW_EVENT',
}

export function classifyLiveEvent(type: MatchEventType): LiveEventCategory {
  return categoryByType[type] ?? 'STATE_ONLY'
}

export function recipientsForLiveEvent(type: MatchEventType): LiveAudience[] {
  if (type === 'GAME_WON' || type === 'SCORE_CORRECTED') return ['admin','referee','team','court_display','main_display']
  if (type === 'CARD_REJECTED') return ['admin','referee','team']
  if (type === 'CARD_PLAYED') return ['admin','referee','team','court_display','main_display']
  return ['admin','referee','team','court_display','main_display']
}

export function buildLivePresentations(tournament: Tournament, audience: LiveAudience, scope?: { matchIds?: string[]; courtId?: string; teamId?: string }): LivePresentation[] {
  const allowedMatches = new Set(scope?.matchIds ?? [])
  const matchAllowed = (matchId: string) => {
    const match = tournament.matches.find(item => item.id === matchId)
    if (!match) return false
    if (scope?.courtId && match.courtId !== scope.courtId) return false
    return !allowedMatches.size || allowedMatches.has(matchId)
  }
  const matchEvents = tournament.matchEvents.flatMap(event => {
    if (!matchAllowed(event.matchId) || !recipientsForLiveEvent(event.type).includes(audience)) return []
    if (['CARD_ACTIVATED','CARD_REJECTED'].includes(event.type)&&(audience!=='team'||event.payload.team_id!==scope?.teamId)) return []
    if (['GAME_WON','SCORE_CORRECTED','CARD_PLAYED','DICE_ROLLED'].includes(event.type)) return []
    const presentation = presentationForMatchEvent(tournament,event,audience)
    return presentation ? [presentation] : []
  })
  const tournamentEvents = (tournament.tournamentEvents ?? []).flatMap(event => {
    if (!recipientsForLiveEvent(event.type).includes(audience)) return []
    const presentation = presentationForTournamentEvent(tournament,event)
    return presentation ? [presentation] : []
  })
  const global = tournament.globalEvents.flatMap(event => presentationForGlobalEvent(tournament,event,audience))
  const combined=[...matchEvents,...tournamentEvents,...global].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime())
  if(audience!=='main_display')return combined
  const starts=combined.filter(item=>/^SET [12] INIZIATO$/.test(item.title))
  if(starts.length<2)return combined
  const collapsedIds=new Set(starts.map(item=>item.id));const latest=starts.at(-1)!
  return [...combined.filter(item=>!collapsedIds.has(item.id)),{...latest,id:`global:${latest.title}:${latest.roundId??latest.createdAt}`,detail:'Tutti i campi'}]
}

function presentationForMatchEvent(tournament:Tournament,event:MatchEvent,audience:LiveAudience):LivePresentation|undefined {
  const match=tournament.matches.find(item=>item.id===event.matchId); if(!match)return
  const court=tournament.courts.find(item=>item.id===match.courtId)?.name??'Campo'
  const teamA=tournament.teams.find(item=>item.id===match.teamAId)?.shortName??'Squadra A'
  const teamB=tournament.teams.find(item=>item.id===match.teamBId)?.shortName??'Squadra B'
  const set=Number(event.payload.set_number??match.score.currentSet)
  const base={id:`match:${event.id}`,matchId:event.matchId,roundId:match.roundId,createdAt:event.createdAt,expiresAfterMs:6500}
  if(event.type==='SET_1_STARTED'||event.type==='SET_2_STARTED')return{...base,category:'INFORMATION',priority:20,title:`SET ${event.type==='SET_1_STARTED'?1:2} INIZIATO`,detail:audience==='main_display'?court:undefined}
  if(event.type==='TIME_EXPIRED')return{...base,category:audience==='referee'?'ACTION_REQUIRED':'ATTENTION',priority:90,title:'TEMPO SCADUTO',detail:audience==='referee'?'INSERISCI / CONTROLLA IL RISULTATO':`${court} · Set ${set}`,expiresAfterMs:9000}
  if(event.type==='SET_RESULT_SUBMITTED')return{...base,category:'ATTENTION',priority:55,title:'RISULTATO RICEVUTO',detail:`${court} · ${teamA} ${event.payload.games_a??0}–${event.payload.games_b??0} ${teamB}`}
  if(event.type==='SUPER_TIEBREAK_REQUIRED')return{...base,category:'ACTION_REQUIRED',priority:85,title:'SUPER TIE-BREAK NECESSARIO',detail:`${court} · ${teamA} vs ${teamB}`,expiresAfterMs:9000}
  if(event.type==='MATCH_COMPLETED')return{...base,category:'ATTENTION',priority:70,title:'PARTITA TERMINATA',detail:`${court} · ${teamA} ${match.score.sets.A}–${match.score.sets.B} ${teamB}`,expiresAfterMs:8500}
  if(event.type==='SET_WON')return{...base,category:'ATTENTION',priority:45,title:`SET ${set} TERMINATO`,detail:`${court} · ${teamA} ${event.payload.games_a??0}–${event.payload.games_b??0} ${teamB}`}
  if(event.type==='CARD_ACTIVATED')return{...base,category:'INFORMATION',priority:50,title:'CARTA ATTIVATA'}
  if(event.type==='CARD_REJECTED')return{...base,category:'ATTENTION',priority:60,title:'CARTA NON CONFERMATA'}
}

function presentationForTournamentEvent(tournament:Tournament,event:TournamentEvent):LivePresentation|undefined {
  const round=tournament.rounds?.find(item=>item.id===event.roundId)
  const base={id:`tournament:${event.id}`,roundId:event.roundId,createdAt:event.createdAt,expiresAfterMs:7000}
  if(event.type==='ROUND_STARTED')return{...base,category:'INFORMATION',priority:40,title:round?.name?.toUpperCase()??`TURNO ${event.payload.sequence??''}`,detail:'INIZIATO'}
  if(event.type==='ROUND_COMPLETED')return{...base,category:'ATTENTION',priority:75,title:'TURNO COMPLETATO',detail:round?.name}
}

function presentationForGlobalEvent(tournament:Tournament,event:GlobalEvent,audience:LiveAudience):LivePresentation[]{
  if(event.status==='active'&&event.startedAt)return[{id:`global:start:${event.id}:${event.startedAt}`,category:'SHOW_EVENT',priority:80,title:'EVENTO SPECIALE',detail:[event.title,event.description,event.prize?`PREMIO · ${event.prize}`:''].filter(Boolean).join(' · '),createdAt:event.startedAt,expiresAfterMs:11000}]
  if(event.status==='completed'&&event.completedAt&&event.winnerPlayerId){
    const team=tournament.teams.find(item=>item.id===event.winnerTeamId);const player=team?.players.find(item=>item.id===event.winnerPlayerId)
    return[{id:`global:winner:${event.id}:${event.completedAt}`,category:'SHOW_EVENT',priority:95,title:'VINCITORE EVENTO',detail:[player?.name,team?.name,event.prize].filter(Boolean).join(' · '),createdAt:event.completedAt,expiresAfterMs:12000}]
  }
  void audience
  return[]
}
