import { motion,useReducedMotion } from 'framer-motion'
import { DisplayShell } from '../shared/components/Foundation'
import { useRoleTournament as useTournament } from '../features/admin/preview/useRoleTournament'
import { useMatchRepository } from '../repositories/matchRepository'
import { ActiveCardEffects,ActiveDiceIndicator,CardPlayNotification } from '../shared/components/LiveEffects'
import { GlobalDiceReveal } from '../shared/components/GlobalDiceReveal'
import { currentPair,displayStatus,getCourtDisplayMatch,setHistory } from '../features/display/displayModel'
import type { Match,Team,Tournament } from '../shared/types/domain'
import { useAuth } from '../features/auth/authContext'
import { SetTimer } from '../shared/components/SetTimer'
import { LiveEventPresenter } from '../shared/components/LiveEventPresenter'

export function CourtDisplayRoute(){
  const {data:tournament}=useTournament();const repo=useMatchRepository();const {profile}=useAuth()
  const securedCourtId=profile?.role==='court_display'?profile.courtId:repo.selectedCourtId
  const court=tournament.courts.find(item=>item.id===securedCourtId)??tournament.courts[0]
  const match=court?getCourtDisplayMatch(tournament,court.id):undefined
  if(!court||!match)return <DisplayShell><main className="grid h-[100svh] place-items-center bg-[#070707] p-8 text-center"><div><p className="text-xl font-black uppercase tracking-[.24em] text-[var(--event-primary)]">Schermo campo</p><h1 className="mt-4 text-5xl font-black">Nessuna partita configurata</h1></div></main></DisplayShell>
  return <CourtPresentation tournament={tournament} match={match} courtName={court.name}/>
}

export function CourtPresentation({tournament,match,courtName}:{tournament:Tournament;match:Match;courtName:string}){
  const teamA=tournament.teams.find(item=>item.id===match.teamAId);const teamB=tournament.teams.find(item=>item.id===match.teamBId)
  const history=setHistory(tournament,match);const waiting=['scheduled','ready','lineup'].includes(match.status)
  return <DisplayShell><GlobalDiceReveal tournament={tournament} audience="court_display"/><CardPlayNotification tournament={tournament} audience="court_display" matchIds={[match.id]} enabled={tournament.displayCardNotificationsEnabled!==false}/><LiveEventPresenter tournament={tournament} audience="court_display" matchIds={[match.id]} courtId={match.courtId}/><main data-display="scoreboard" className="grid h-[100svh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#070707] px-[clamp(1.25rem,3vw,4rem)] py-[clamp(1rem,2.5vh,2.5rem)] text-white">
    <header className="flex items-center justify-between gap-6 border-b border-white/10 pb-3"><div className="min-w-0"><p className="truncate text-[clamp(.8rem,1.2vw,1.2rem)] font-black uppercase tracking-[.24em] text-[var(--event-primary)]">{tournament.name}</p><h1 className="text-[clamp(2rem,4vw,4.5rem)] font-black uppercase">{courtName}</h1></div><div className="shrink-0 text-right"><p className="text-[clamp(.75rem,1vw,1rem)] font-black uppercase text-white/45">Stato partita</p><p className="text-[clamp(1.5rem,3vw,3.5rem)] font-black text-[var(--event-primary)]">{displayStatus(match)}</p></div></header>
    <section className="grid min-h-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[clamp(1rem,4vw,5rem)] py-4"><TeamSide team={teamA} pair={currentPair(tournament,match,match.teamAId)} align="left"/><div className="text-center"><p className="text-xs font-black uppercase tracking-[.25em] text-white/35">{waiting?'Punteggio':'Game'}</p>{waiting?<p className="mt-5 text-[clamp(2rem,5vw,5rem)] font-black text-white/35">IN ATTESA</p>:<div className="mt-2 flex items-center gap-[clamp(1rem,3vw,3rem)]"><AnimatedScore value={match.score.games.A}/><span className="text-[clamp(2rem,5vw,5rem)] text-white/25">—</span><AnimatedScore value={match.score.games.B}/></div>}<div className="mt-5 flex justify-center gap-3">{history.map(item=><span key={item.set} className="rounded border border-white/15 bg-white/[.05] px-4 py-2 text-[clamp(.8rem,1.3vw,1.3rem)] font-black">SET {item.set} · {item.gamesA}–{item.gamesB}</span>)}</div></div><TeamSide team={teamB} pair={currentPair(tournament,match,match.teamBId)} align="right"/></section>
    <footer className="grid grid-cols-[minmax(220px,.45fr)_1fr] gap-3 border-t border-white/10 pt-3"><SetTimer match={match} size="display"/><div className="grid gap-2"><ActiveDiceIndicator tournament={tournament} match={match}/><ActiveCardEffects tournament={tournament} match={match}/></div></footer>
  </main></DisplayShell>
}
function TeamSide({team,pair,align}:{team?:Team;pair?:string[];align:'left'|'right'}){return <div className={`min-w-0 ${align==='right'?'text-right':''}`}><h2 className="truncate text-[clamp(2rem,4.5vw,5.5rem)] font-black uppercase leading-none">{team?.name??'Squadra'}</h2><div className="mt-[clamp(1rem,3vh,2rem)] space-y-2">{pair?.length===2?pair.map(name=><p key={name} className="truncate text-[clamp(1.1rem,2vw,2.2rem)] font-bold text-white/70">{name}</p>):<p className="text-[clamp(1rem,1.5vw,1.5rem)] font-bold text-white/35">Formazione non disponibile</p>}</div></div>}
function AnimatedScore({value}:{value:number}){const reduced=useReducedMotion();return <motion.strong key={value} initial={reduced?false:{scale:1.22,color:'var(--event-primary)'}} animate={{scale:1,color:'#fff'}} className="text-[clamp(6rem,16vw,18rem)] font-black tabular-nums leading-none">{value}</motion.strong>}
