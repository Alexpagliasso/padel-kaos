import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Tournament } from '../types/domain'
import type { DiceAudience } from '../../domain/live/dicePresentation'
import { dismissSpecialEventReveal, eventArtwork, openSpecialEventReveal, SPECIAL_EVENT_CONTINUE_MS, SPECIAL_EVENT_DISMISSED_EVENT } from '../../domain/live/specialEventPresentation'

export function GlobalSpecialEventReveal({tournament,audience}:{tournament:Tournament;audience:DiceAudience}) {
  const [now,setNow]=useState(()=>Date.now())
  const occurrences=tournament.globalEvents.map(event=>`${event.id}:${event.startedAt??''}`).join('|')
  useEffect(()=>{const timer=window.setTimeout(()=>setNow(Date.now()),0);return()=>window.clearTimeout(timer)},[occurrences])
  const reveal=openSpecialEventReveal(tournament,audience,now)
  useEffect(()=>{
    if(!reveal)return
    const update=()=>setNow(Date.now())
    const timer=window.setInterval(update,100)
    window.addEventListener(SPECIAL_EVENT_DISMISSED_EVENT,update)
    return()=>{window.clearInterval(timer);window.removeEventListener(SPECIAL_EVENT_DISMISSED_EVENT,update)}
  },[reveal?.key])
  if(!reveal)return null
  const unattended=audience==='court_display'||audience==='main_display'
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Evento speciale" className="fixed inset-0 z-[2147483646] grid place-items-center overflow-y-auto bg-[radial-gradient(circle_at_50%_35%,#471d63,#12091c_65%,#050409)] p-4 text-white">
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 py-6 text-center">
      <p className="text-sm font-black uppercase tracking-[.28em] text-fuchsia-200">PADEL KAOS · EVENTO SPECIALE</p>
      <img className="max-h-[35dvh] w-full max-w-xl rounded-2xl border border-fuchsia-300/30 object-contain shadow-[0_0_60px_#d946ef55]" src={eventArtwork(reveal.event)} alt={`Illustrazione ${reveal.event.title}`} />
      <h1 className="text-[clamp(2.4rem,8vw,6rem)] font-black uppercase leading-none">{reveal.event.title}</h1>
      <p className="max-w-2xl text-lg font-bold text-white/85">{reveal.event.description}</p>
      {reveal.event.prize&&<p className="font-black text-fuchsia-200">PREMIO · {reveal.event.prize}</p>}
      {!unattended&&reveal.elapsed>=SPECIAL_EVENT_CONTINUE_MS&&<button type="button" className="mt-2 min-h-16 min-w-[min(90vw,340px)] rounded-xl border-2 border-white bg-fuchsia-300 px-8 text-xl font-black text-black focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white" onClick={()=>dismissSpecialEventReveal(reveal.key)}>CONTINUA</button>}
    </div>
  </div>,document.body)
}
