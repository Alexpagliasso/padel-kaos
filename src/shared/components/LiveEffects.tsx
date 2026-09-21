import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CreditCard, Dices } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Match, Tournament } from '../types/domain'
import { formatCountdown, getDiceEffect } from '../../domain/live/readiness'
import { dataProvider } from '../../repositories'
import { requireSupabase } from '../../services/supabase/client'
import { supabaseTournamentKeys } from '../../repositories/supabase/queryKeys'
import { useSharedClock } from '../hooks/useSharedClock'

const revealMs = 5500
const cardNoticeMs = 5200

type CardNotice = { eventId:string;matchId:string;matchCardId:string;teamId:string;cardDefinitionId:string;requiresValidation:boolean }

export function CardPlayNotification({tournament,matchIds,excludeTeamId,enabled=true}:{tournament:Tournament;matchIds?:string[];excludeTeamId?:string;enabled?:boolean}) {
  const [queue,setQueue]=useState<CardNotice[]>([])
  const [visible,setVisible]=useState(false)
  const initialized=useRef(false)
  const now=useSharedClock()
  const scope=useMemo(()=>new Set(matchIds??[]),[matchIds])
  const events=useMemo(()=>tournament.matchEvents.filter(event=>event.type==='CARD_PLAYED'&&(!scope.size||scope.has(event.matchId))&&event.payload.team_id!==excludeTeamId),[excludeTeamId,scope,tournament.matchEvents])
  const diceRevealActive=tournament.rounds?.some(round=>round.diceRolledAt&&now-new Date(round.diceRolledAt).getTime()<revealMs)??false
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
  if(!visible||!queued)return null
  const match=tournament.matches.find(item=>item.id===queued.matchId)
  const court=tournament.courts.find(item=>item.id===match?.courtId)
  const team=tournament.teams.find(item=>item.id===queued.teamId)
  const definition=tournament.cards.find(item=>item.id===queued.cardDefinitionId)
  return <AnimatePresence><motion.aside role="status" aria-live="assertive" className="fixed inset-x-3 top-3 z-[2300] mx-auto max-w-2xl rounded-2xl border border-amber-300/60 bg-[#17120a]/95 p-5 text-center text-white shadow-2xl backdrop-blur" initial={{opacity:0,y:-24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}><CreditCard className="mx-auto size-8 text-amber-200"/><p className="mt-2 text-xs font-black uppercase tracking-[.2em] text-amber-200">CARTA GIOCATA</p>{court&&<p className="mt-1 text-sm font-black uppercase text-white/55">{court.name}</p>}<h2 className="mt-2 text-2xl font-black uppercase">{team?.name??'Squadra'}</h2><p className="text-xl font-black">{definition?.name??'Carta'}</p><p className="mt-2 font-bold text-white/70">{queued.requiresValidation?'IN ATTESA DELL’ARBITRO':'CARTA ATTIVA'}</p></motion.aside></AnimatePresence>
}

export function GlobalDiceReveal({ tournament }: { tournament: Tournament }) {
  const queryClient=useQueryClient()
  const round = tournament.rounds?.find(item => item.diceResult && item.diceRolledAt)
  const rule = tournament.diceRules.find(item => item.id === round?.diceRuleId)
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const previous = useRef<string | undefined>(undefined)
  useEffect(()=>{
    if(dataProvider!=='supabase'||!tournament.id||tournament.id==='demo-tournament'||tournament.id==='empty-tournament')return
    const client=requireSupabase()
    const refresh=()=>{void queryClient.invalidateQueries({queryKey:supabaseTournamentKeys.detail(tournament.id)})}
    const channel=client.channel(`live-effects:${tournament.id}:${crypto.randomUUID()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'rounds',filter:`tournament_id=eq.${tournament.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_cards'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_events',filter:`tournament_id=eq.${tournament.id}`},refresh)
      .subscribe()
    return()=>{void client.removeChannel(channel)}
  },[queryClient,tournament.id])
  useEffect(() => {
    const stamp = round?.diceRolledAt
    if (!stamp || !rule) return
    const age = Date.now() - new Date(stamp).getTime()
    const key = `padel-kaos:dice-reveal:${round.id}:${stamp}`
    const unseen = sessionStorage.getItem(key) !== 'seen'
    const justChanged = previous.current !== undefined && previous.current !== stamp
    previous.current = stamp
    if ((!unseen && !justChanged) || age < 0 || age >= revealMs) return
    sessionStorage.setItem(key, 'seen')
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), Math.max(400, revealMs - age))
    return () => window.clearTimeout(timer)
  }, [round?.id, round?.diceRolledAt, rule])
  return <AnimatePresence>{visible && rule && <motion.div role="dialog" aria-label="Risultato dado globale" className="fixed inset-0 z-[2500] grid place-items-center overflow-hidden bg-[#070707] p-5 text-center text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="max-w-5xl"><p className="text-sm font-black uppercase tracking-[.3em] text-[var(--event-primary)]">Dado globale</p><motion.div className="mx-auto my-8 grid size-[min(54vw,280px)] place-items-center rounded-[28%] border-4 border-[var(--event-primary)] bg-[#171717] shadow-[0_0_90px_var(--event-soft)]" initial={{ rotateX: 0, rotateY: 0, scale: .7 }} animate={reduced ? { scale: [0.8,1] } : { rotateX: [0,720,1080], rotateY: [0,900,1260], scale: [.7,1.05,1] }} transition={{ duration: reduced ? .35 : 3.4, ease: 'easeOut' }}><Dices className="size-2/3 text-[var(--event-primary)]" /></motion.div><motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? .15 : 3.2 }}><p className="text-sm font-black uppercase tracking-[.25em]">Effetto globale</p><h1 className="mt-3 text-[clamp(2.6rem,9vw,7rem)] font-black uppercase leading-none">{rule.title}</h1></motion.div></div>
  </motion.div>}</AnimatePresence>
}

export function ActiveDiceIndicator({ tournament, match }: { tournament: Tournament; match: Match }) {
  const now = useSharedClock()
  const effect = getDiceEffect(tournament, match, now)
  if (!effect.active || !effect.rule) return null
  return <aside className="flex items-center justify-between gap-4 rounded-xl border border-amber-300/35 bg-amber-300/10 p-3 text-amber-100"><span className="flex min-w-0 items-center gap-2"><Dices className="size-5 shrink-0" /><strong className="truncate uppercase">{effect.rule.title}</strong></span><strong className="text-xl tabular-nums">{formatCountdown(effect.remainingSeconds)}</strong></aside>
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
  return <section className="grid gap-2 sm:grid-cols-2">{effects.map(({card,definition,team,player})=><article key={card.id} className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3"><p className="text-xs font-black uppercase text-emerald-200">{card.teamId===viewerTeamId?'La tua carta attiva':'Carta avversaria attiva'} · {team?.name}</p><h3 className="mt-1 text-lg font-black">{definition?.name}</h3>{player&&<p className="text-sm font-bold">{player.name}</p>}{card.expiresAt&&<p className="mt-2 text-2xl font-black tabular-nums">{formatCountdown(Math.max(0,Math.ceil((new Date(card.expiresAt).getTime()-now)/1000)))}</p>}</article>)}</section>
}
