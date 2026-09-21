import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CreditCard, Dices } from 'lucide-react'
import type { Match, Tournament } from '../types/domain'
import { formatCountdown, getDiceEffect } from '../../domain/live/readiness'
import { useSharedClock } from '../hooks/useSharedClock'
import { getDiceFace } from '../../domain/live/diceShow'
import { DICE_DISMISSED_EVENT, openDiceReveal, type DiceAudience } from '../../domain/live/dicePresentation'

const cardNoticeMs = 5200

type CardNotice = { eventId:string;matchId:string;matchCardId:string;teamId:string;cardDefinitionId:string;requiresValidation:boolean }

export function CardPlayNotification({tournament,audience='team',matchIds,excludeTeamId,enabled=true}:{tournament:Tournament;audience?:DiceAudience;matchIds?:string[];excludeTeamId?:string;enabled?:boolean}) {
  const [queue,setQueue]=useState<CardNotice[]>([])
  const [visible,setVisible]=useState(false)
  const initialized=useRef(false)
  const now=useSharedClock()
  const [,forceRefresh]=useState(0)
  useEffect(()=>{const update=()=>forceRefresh(value=>value+1);window.addEventListener(DICE_DISMISSED_EVENT,update);return()=>window.removeEventListener(DICE_DISMISSED_EVENT,update)},[])
  const scope=useMemo(()=>new Set(matchIds??[]),[matchIds])
  const events=useMemo(()=>tournament.matchEvents.filter(event=>event.type==='CARD_PLAYED'&&(!scope.size||scope.has(event.matchId))&&event.payload.team_id!==excludeTeamId),[excludeTeamId,scope,tournament.matchEvents])
  const diceRevealActive=Boolean(openDiceReveal(tournament,audience,now))
  useEffect(()=>{
    const eventKeys=events.map(event=>`padel-kaos:card-play:${event.id}`)
    if(!initialized.current){eventKeys.forEach(key=>sessionStorage.setItem(key,'seen'));initialized.current=true;return}
    if(!enabled){eventKeys.forEach(key=>sessionStorage.setItem(key,'seen'));return}
    const unseen=events.filter(item=>sessionStorage.getItem(`padel-kaos:card-play:${item.id}`)!=='seen')
    if(!unseen.length)return
    eventKeys.forEach(key=>sessionStorage.setItem(key,'seen'))
    const notices=unseen.map(event=>({eventId:event.id,matchId:event.matchId,matchCardId:typeof event.payload.match_card_id==='string'?event.payload.match_card_id:'',teamId:typeof event.payload.team_id==='string'?event.payload.team_id:'',cardDefinitionId:typeof event.payload.card_definition_id==='string'?event.payload.card_definition_id:'',requiresValidation:event.payload.requires_referee_validation===true})).filter(item=>item.matchCardId&&item.teamId&&item.cardDefinitionId)
    if(notices.length)setQueue(current=>[...current,...notices.filter(notice=>!current.some(item=>item.eventId===notice.eventId))])
  },[enabled,events])
  const queued=queue[0]
  const queuedCard=queued?tournament.teamCards.find(card=>card.id===queued.matchCardId):undefined
  const queuedMatch=queued?tournament.matches.find(match=>match.id===queued.matchId):undefined
  useEffect(()=>{if(queued?.requiresValidation&&queuedCard?.state!=='pending'){setVisible(false);setQueue(current=>current.slice(1))}},[queued,queuedCard?.state])
  useEffect(()=>{if(queued&&(queuedMatch?.resultConfirmedAt||queuedMatch?.status==='completed')){setVisible(false);setQueue(current=>current.slice(1))}},[queued,queuedMatch?.resultConfirmedAt,queuedMatch?.status])
  useEffect(()=>{
    if(!queued||diceRevealActive||!enabled)return
    setVisible(true)
    const timer=window.setTimeout(()=>{setVisible(false);setQueue(current=>current.slice(1))},cardNoticeMs)
    return()=>window.clearTimeout(timer)
  },[diceRevealActive,enabled,queued])
  if(!visible||!queued||diceRevealActive)return null
  const match=tournament.matches.find(item=>item.id===queued.matchId)
  const court=tournament.courts.find(item=>item.id===match?.courtId)
  const team=tournament.teams.find(item=>item.id===queued.teamId)
  const definition=tournament.cards.find(item=>item.id===queued.cardDefinitionId)
  return <AnimatePresence><motion.aside role="status" aria-live="assertive" className="fixed inset-x-3 top-3 z-[2300] mx-auto max-w-2xl rounded-2xl border border-amber-300/60 bg-[#17120a]/95 p-5 text-center text-white shadow-2xl backdrop-blur" initial={{opacity:0,y:-24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}><CreditCard className="mx-auto size-8 text-amber-200"/><p className="mt-2 text-xs font-black uppercase tracking-[.2em] text-amber-200">CARTA GIOCATA</p>{court&&<p className="mt-1 text-sm font-black uppercase text-white/55">{court.name}</p>}<h2 className="mt-2 text-2xl font-black uppercase">{team?.name??'Squadra'}</h2><p className="text-xl font-black">{definition?.name??'Carta'}</p><p className="mt-2 font-bold text-white/70">{queued.requiresValidation?'IN ATTESA DELLâ€™ARBITRO':'CARTA ATTIVA'}</p></motion.aside></AnimatePresence>
}

export function ActiveDiceIndicator({ tournament, match }: { tournament: Tournament; match: Match }) {
  const now = useSharedClock()
  const effect = getDiceEffect(tournament, match, now)
  const face=getDiceFace(effect.rule,effect.round?.diceResult)
  if (!face || !['set_break','live_set_2','super_tiebreak'].includes(match.status)) return null
  return <aside className="flex items-center justify-between gap-4 rounded-xl border border-amber-300/35 bg-amber-300/10 p-3 text-amber-100"><span className="flex min-w-0 items-center gap-2"><Dices className="size-5 shrink-0" /><span><span className="block text-xs font-black uppercase tracking-wider">REGOLA DADO</span><strong className="block uppercase">{face.title}</strong><span className="block text-xs">{face.shortDescription}</span></span></span><strong className="shrink-0 text-sm tabular-nums">{effect.active?formatCountdown(effect.remainingSeconds):match.status==='set_break'?'IN ATTESA DEL SET 2':'EFFETTO TERMINATO'}</strong></aside>
}

export function ActiveCardEffects({ tournament, match, viewerTeamId }: { tournament: Tournament; match: Match; viewerTeamId?: string }) {
  const now=useSharedClock()
  const effects=useMemo(()=>tournament.teamCards.filter(card=>card.matchId===match.id&&card.state==='active').map(card=>{
    const definition=tournament.cards.find(item=>item.id===card.cardId)
    const event=[...tournament.matchEvents].reverse().find(item=>item.matchId===match.id&&item.type==='CARD_ACTIVATED'&&item.payload.match_card_id===card.id)
    const playerId=typeof event?.payload.selected_player_id==='string'?event.payload.selected_player_id:undefined
    const team=tournament.teams.find(item=>item.id===card.teamId)
    const player=team?.players.find(item=>item.id===playerId)
    return {card,definition,team,player}
  }).filter(item=>item.definition),[tournament,match.id])
  if(!effects.length)return null
  return <section className="grid gap-2 sm:grid-cols-2">{effects.map(({card,definition,team,player})=><article key={card.id} className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3"><p className="text-xs font-black uppercase text-emerald-200">{card.teamId===viewerTeamId?'La tua carta attiva':'Carta avversaria attiva'} Â· {team?.name}</p><h3 className="mt-1 text-lg font-black">{definition?.name}</h3>{player&&<p className="text-sm font-bold">{player.name}</p>}{card.expiresAt&&<p className="mt-2 text-2xl font-black tabular-nums">{formatCountdown(Math.max(0,Math.ceil((new Date(card.expiresAt).getTime()-now)/1000)))}</p>}</article>)}</section>
}
