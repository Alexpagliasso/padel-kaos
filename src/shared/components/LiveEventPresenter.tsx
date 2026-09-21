import { useEffect,useMemo,useRef,useState } from 'react'
import { AnimatePresence,motion } from 'framer-motion'
import { buildLivePresentations,type LiveAudience,type LivePresentation } from '../../domain/live/liveEvents'
import type { Tournament } from '../types/domain'
import { useSharedClock } from '../hooks/useSharedClock'
import { useQueryClient } from '@tanstack/react-query'
import { dataProvider } from '../../repositories'
import { requireSupabase } from '../../services/supabase/client'
import { supabaseTournamentKeys } from '../../repositories/supabase/queryKeys'

export function LiveEventPresenter({tournament,audience,matchIds,courtId,teamId}:{tournament:Tournament;audience:LiveAudience;matchIds?:string[];courtId?:string;teamId?:string}){
  const [queue,setQueue]=useState<LivePresentation[]>([]);const initialized=useRef(false);const now=useSharedClock();const queryClient=useQueryClient()
  const scopeKey=(matchIds??[]).join(',')
  const candidates=useMemo(()=>buildLivePresentations(tournament,audience,{matchIds,courtId,teamId}),[audience,courtId,scopeKey,teamId,tournament])
  const diceRevealActive=tournament.rounds?.some(round=>round.diceRolledAt&&now-new Date(round.diceRolledAt).getTime()<5500)??false
  useEffect(()=>{
    if(dataProvider!=='supabase'||!tournament.id||tournament.id==='empty-tournament'||tournament.id==='demo-tournament')return
    const client=requireSupabase();const refresh=()=>{void queryClient.invalidateQueries({queryKey:supabaseTournamentKeys.detail(tournament.id)})}
    const channel=client.channel(`live-presentations:${tournament.id}:${crypto.randomUUID()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'matches',filter:`tournament_id=eq.${tournament.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'rounds',filter:`tournament_id=eq.${tournament.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'match_events',filter:`tournament_id=eq.${tournament.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'tournament_events',filter:`tournament_id=eq.${tournament.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'global_events',filter:`tournament_id=eq.${tournament.id}`},refresh)
      .subscribe()
    return()=>{void client.removeChannel(channel)}
  },[queryClient,tournament.id])
  useEffect(()=>{
    const keys=candidates.map(item=>`padel-kaos:live-event:${audience}:${item.id}`)
    if(!initialized.current){keys.forEach(key=>sessionStorage.setItem(key,'seen'));initialized.current=true;return}
    const fresh=candidates.filter(item=>sessionStorage.getItem(`padel-kaos:live-event:${audience}:${item.id}`)!=='seen'&&Date.now()-new Date(item.createdAt).getTime()<item.expiresAfterMs)
    keys.forEach(key=>sessionStorage.setItem(key,'seen'))
    if(fresh.length)setQueue(current=>[...current,...fresh].sort((a,b)=>b.priority-a.priority||new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()))
  },[audience,candidates])
  const current=queue[0]
  useEffect(()=>{
    if(!current||diceRevealActive)return
    const remaining=current.expiresAfterMs-(Date.now()-new Date(current.createdAt).getTime())
    if(remaining<=0){setQueue(items=>items.slice(1));return}
    const timer=window.setTimeout(()=>setQueue(items=>items.slice(1)),Math.min(remaining,current.category==='SHOW_EVENT'?9000:6000))
    return()=>window.clearTimeout(timer)
  },[current,diceRevealActive])
  if(!current||diceRevealActive)return null
  const prominent=current.category==='SHOW_EVENT'||current.category==='ACTION_REQUIRED'
  return <AnimatePresence><motion.aside role="status" aria-live={current.category==='ACTION_REQUIRED'?'assertive':'polite'} className={prominent?'fixed inset-0 z-[2200] grid place-items-center bg-black/90 p-6 text-center text-white':'fixed inset-x-3 top-3 z-[2200] mx-auto max-w-2xl rounded-xl border border-white/20 bg-[#171717]/95 p-4 text-center text-white shadow-2xl'} initial={{opacity:0,y:prominent?0:-18}} animate={{opacity:1,y:0}} exit={{opacity:0}}><div><p className="text-xs font-black uppercase tracking-[.2em] text-[var(--event-primary)]">PADEL KAOS LIVE</p><h2 className={prominent?'mt-3 text-[clamp(2rem,8vw,6rem)] font-black uppercase':'mt-1 text-2xl font-black uppercase'}>{current.title}</h2>{current.detail&&<p className="mx-auto mt-3 max-w-3xl font-bold text-white/70">{current.detail}</p>}</div></motion.aside></AnimatePresence>
}
