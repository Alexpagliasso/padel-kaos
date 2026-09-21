import { Alert } from '@mui/material'
import { dataProvider } from '../repositories'
import { canPreviewAsAdmin } from '../features/admin/preview/previewPolicy'
import { useAuth } from '../features/auth/authContext'
import { MatchReportSubmission } from '../features/admin/reports/MatchReportSubmission'
import { SetTimer } from '../shared/components/SetTimer'
import { useSharedClock } from '../shared/hooks/useSharedClock'
import { setHistory } from '../features/display/displayModel'
import { MatchTimer } from '../shared/components/MatchTimer'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bolt, CreditCard, Dice5, RotateCcw, Trophy, Undo2 } from 'lucide-react'
import { MobileRoleShell, PrimaryAction, DangerAction, EmptyState } from '../shared/components/Foundation'
import { Scoreboard } from '../shared/components/Scoreboard'
import { LineupStrip } from '../shared/components/LineupStrip'
import { DiceRoll } from '../shared/components/DiceRoll'
import { GenderBonusBadge } from '../shared/components/GenderBonusBadge'
import { EventPresentationOverlay } from '../shared/components/EventPresentationOverlay'
import { useRoleTournament as useTournament } from '../features/admin/preview/useRoleTournament'
import { getCurrentLineups, getDiceRuleForMatch, getPlayerName, getTeam } from '../features/tournament/selectors'
import { getMatchStartingScore } from '../demo/demoStore'
import { canScorePoint } from '../domain/rules/rulesEngine'
import { useEventRepository } from '../repositories/eventRepository'
import { useMatchRepository } from '../repositories/matchRepository'
import { useDemoStore } from '../demo/demoStore'
import { listMyRefereeCourtIds } from '../services/supabase/provisioning'
import { LogoutButton } from '../features/auth/LogoutButton'
import { useLiveOrchestrationRepository, type SetAction } from '../repositories/liveOrchestrationRepository'
import { useLiveMatchRepository } from '../repositories/liveMatchRepository'
import type { CardDefinition, Match, Team, TeamCard, Tournament } from '../shared/types/domain'
import { formatCountdown, getDiceEffect, getPersistedSetResult } from '../domain/live/readiness'
import { ActiveCardEffects, ActiveDiceIndicator, CardPlayNotification, GlobalDiceReveal } from '../shared/components/LiveEffects'
import { LiveEventPresenter } from '../shared/components/LiveEventPresenter'
import { getSetTimer } from '../domain/live/setTimer'

export function RefereeRoute() {
  const { profile, status: authStatus } = useAuth()
  const readOnlyPreview = dataProvider === 'supabase' && canPreviewAsAdmin(authStatus, profile?.role)
  const { data: tournament, isLoading, error } = useTournament()
  const matchRepo = useMatchRepository()
  const eventRepo = useEventRepository()
  const acknowledgeCard = useDemoStore((state) => state.acknowledgeCard)
  const [porTresPlayerId, setPorTresPlayerId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [assignedCourtIds, setAssignedCourtIds] = useState<string[]>([])
  const [assignedCourtsLoading, setAssignedCourtsLoading] = useState(false)
  const logoutAction = profile?.role === 'referee' ? <LogoutButton minimal /> : undefined

  useEffect(() => {
    if (dataProvider !== 'supabase' || profile?.role !== 'referee') return
    let active = true
    setAssignedCourtsLoading(true)
    listMyRefereeCourtIds(profile.tournamentId, profile.id)
      .then((ids) => { if (active) setAssignedCourtIds(ids) })
      .catch(() => { if (active) setAssignedCourtIds([]) })
      .finally(() => { if (active) setAssignedCourtsLoading(false) })
    return () => { active = false }
  }, [profile?.id, profile?.role, profile?.tournamentId])

  if (dataProvider === 'supabase' && profile?.role === 'referee') {
    return <RefereeAssignedCourtsView tournament={tournament} courtIds={assignedCourtIds} isLoading={isLoading || assignedCourtsLoading} error={error} headerAction={logoutAction} />
  }

  const match = tournament.matches.find((item) => item.id === matchRepo.selectedMatchId) ?? tournament.matches[0]
  if (!match) return <MobileRoleShell title="Partita attuale"><main className="p-4"><EmptyState title="Nessuna partita configurata" /></main></MobileRoleShell>
  const teamA = getTeam(tournament, match.teamAId)
  const teamB = getTeam(tournament, match.teamBId)
  const diceRule = getDiceRuleForMatch(tournament, match)
  const pendingCards = tournament.teamCards.filter((teamCard) => {
    const isMatchCard = !teamCard.matchId || teamCard.matchId === match.id
    return teamCard.state === 'pending' && isMatchCard
  })
  const startingScore = getMatchStartingScore(tournament, match)
  const scorePermission = canScorePoint(match)
  const activePlayers = getCurrentLineups(match).flatMap((lineup) => {
    const team = getTeam(tournament, lineup.teamId)
    return lineup.activePlayerIds.map((playerId) => ({
      id: playerId,
      label: `${getPlayerName(team, playerId)} · ${team?.name ?? ''}`,
    }))
  })
  const selectedPorTresPlayer = porTresPlayerId || activePlayers[0]?.id || ''

  return (
    <MobileRoleShell title="Partita attuale" status={tournament.status ?? match.status}>
      <main className="mx-auto max-w-5xl px-4 py-5">
        {readOnlyPreview && <Alert severity="info" sx={{ mb: 3 }}>Anteprima Admin. I controlli operativi sono disattivati per i dati collegati.</Alert>}
        <fieldset disabled={readOnlyPreview} className="min-w-0 space-y-5 border-0 p-0">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">PARTITA ATTUALE</p>
            <h1 className="text-3xl font-black">{teamA?.shortName} vs {teamB?.shortName}</h1>
          </div>
          <label className="grid gap-1 text-sm font-bold text-white/55">
            Partita da gestire
            <select className="rounded border border-white/10 bg-black px-3 py-3 text-white" value={match.id} onChange={(event) => matchRepo.selectMatch(event.target.value)}>
              {tournament.matches.map((item) => {
                const itemA = getTeam(tournament, item.teamAId)
                const itemB = getTeam(tournament, item.teamBId)
                return <option key={item.id} value={item.id}>{itemA?.shortName} vs {itemB?.shortName}</option>
              })}
            </select>
          </label>
        </div>
        <EventPresentationOverlay events={eventRepo.events} />
        <Scoreboard match={match} teamA={teamA} teamB={teamB} />
        <GenderBonusBadge score={startingScore} />
        <MatchReportSubmission key={match.id} tournament={tournament} match={match} referee={profile?.displayName || profile?.username || 'Arbitro demo'} events={eventRepo.events} />
        {!scorePermission.allowed ? (
          <p className="rounded border border-[var(--event-primary)]/40 bg-[var(--event-primary)]/10 p-4 font-bold text-[var(--event-primary)]">
            {scorePermission.reason}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <PrimaryAction disabled={!scorePermission.allowed} sx={{ minHeight: 88, fontSize: 22 }} onClick={() => matchRepo.scorePoint(match.id, 'A')}>+ Punto {teamA?.shortName}</PrimaryAction>
          <PrimaryAction disabled={!scorePermission.allowed} color="secondary" sx={{ minHeight: 88, fontSize: 22 }} onClick={() => matchRepo.scorePoint(match.id, 'B')}>+ Punto {teamB?.shortName}</PrimaryAction>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Action icon={Undo2} label="Annulla demo" disabled />
          <Action icon={Bolt} label={`Carte ${pendingCards.length}`} onClick={() => document.getElementById('pending-cards')?.scrollIntoView()} />
          <Action icon={Trophy} label="Por Tres" onClick={() => document.getElementById('special-events')?.scrollIntoView()} />
          <button className="inline-flex min-h-16 items-center justify-center gap-2 rounded border border-white/10 bg-[#171717] px-3 py-4 font-black" onClick={() => matchRepo.rollKaosDice(match.id)}>
            <Dice5 className="size-5 text-[var(--event-primary)]" />
            Lancia dado
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button className="rounded bg-white/10 px-4 py-4 font-black" onClick={() => matchRepo.endSet(match.id)}>Termina set</button>
          <button className="rounded bg-[var(--event-primary)] px-4 py-4 font-black text-black" onClick={() => matchRepo.startSecondSet(match.id)}>Avvia set 2</button>
          <DangerAction onClick={() => {
            if (window.confirm('Terminare la partita?')) matchRepo.endMatch(match.id)
          }}>Termina partita</DangerAction>
        </div>

        {pendingCards.length ? (
          <section id="pending-cards" className="rounded border border-[var(--event-primary)]/40 bg-[var(--event-primary)]/10 p-5">
            <h2 className="mb-4 text-xl font-black">Eventi in attesa</h2>
            <div className="grid gap-3">
              {pendingCards.map((teamCard) => {
                const team = getTeam(tournament, teamCard.teamId)
                const card = tournament.cards.find((item) => item.id === teamCard.cardId)
                return (
                  <article key={teamCard.id} className="rounded bg-black/40 p-4">
                    <p className="text-sm font-black uppercase text-[var(--event-primary)]">{team?.name} ha giocato</p>
                    <h3 className="text-2xl font-black">{card?.name}</h3>
                    <p className="mb-3 text-white/65">{card?.longDescription ?? card?.description}</p>
                    <button className="rounded bg-[var(--event-primary)] px-4 py-3 font-black text-black" onClick={() => setFeedback(acknowledgeCard(teamCard.id).message)}>Conferma</button>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        <MatchTimer match={match} tournament={tournament} /><LineupStrip match={match} teamA={teamA} teamB={teamB} />
        {diceRule ? (
          <section className="rounded border border-[var(--event-primary)]/30 bg-[var(--event-primary)]/10 p-5">
            <DiceRoll value={diceRule.value} label={diceRule.title} />
            <p className="mt-4 text-white/70">{diceRule.description}</p>
          </section>
        ) : null}

        <section className="rounded border border-white/10 bg-[#171717] p-5">
          <h2 id="special-events" className="mb-4 text-xl font-black">Eventi speciali</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <select className="rounded bg-black px-3 py-3" value={selectedPorTresPlayer} onChange={(event) => setPorTresPlayerId(event.target.value)}>
              {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}
            </select>
            <button className="rounded bg-[var(--event-primary)] px-4 py-3 font-black text-black" onClick={() => setFeedback(eventRepo.registerPorTres(match.id, selectedPorTresPlayer).message)}>
              Registra Por Tres
            </button>
          </div>
          {feedback ? <p className="mt-3 rounded bg-white/10 p-3 font-bold">{feedback}</p> : null}
        </section>

        <section className="rounded border border-white/10 bg-[#171717] p-5">
          <h2 className="mb-4 text-xl font-black">Cronologia eventi</h2>
          <div className="space-y-3">
            {eventRepo.events.filter((event) => !event.matchId || event.matchId === match.id).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded bg-white/[0.04] p-3">
                <span className="font-bold">{event.type}</span>
                <span className="text-xs text-white/45">{new Date(event.createdAt).toLocaleTimeString('it-IT')}</span>
              </div>
            ))}
          </div>
        </section>
        </fieldset>
      </main>
    </MobileRoleShell>
  )
}

export function RefereeAssignedCourtsView({ tournament, courtIds, isLoading, error, headerAction }: { tournament: ReturnType<typeof useTournament>['data']; courtIds: string[]; isLoading?: boolean; error?: string; headerAction?: ReactNode }) {
  const [selectedCourtId, setSelectedCourtId] = useState('')
  if (isLoading) return <MobileRoleShell title="Area arbitro" action={headerAction}><main className="p-4"><p>Caricamento campi…</p></main></MobileRoleShell>
  if (courtIds.length === 1) return <RefereePreparationView tournament={tournament} courtId={courtIds[0]} error={error} headerAction={headerAction} />
  if (!courtIds.length) return <RefereePreparationView tournament={tournament} courtId="" error={error} headerAction={headerAction} />
  if (!selectedCourtId) return <MobileRoleShell title="Seleziona campo" action={headerAction}><GlobalDiceReveal tournament={tournament} /><main className="grid gap-3 p-4">
    <h1 className="text-2xl font-black">Seleziona campo</h1>
    {courtIds.map((id) => { const match=tournament.matches.find(item=>item.courtId===id&&(item.status!=='completed'||!item.resultConfirmedAt)); const pending=tournament.teamCards.filter(card=>card.matchId===match?.id&&card.state==='pending').length; return <button key={id} className="rounded border border-white/10 bg-[#171717] px-4 py-4 text-left" onClick={() => setSelectedCourtId(id)}><span className="block text-xl font-black text-[var(--event-primary)]">{tournament.courts.find((court) => court.id === id)?.name ?? 'Campo'}</span>{match ? <><span className="mt-1 block font-bold">{tournament.teams.find(team=>team.id===match.teamAId)?.shortName} vs {tournament.teams.find(team=>team.id===match.teamBId)?.shortName}</span><span className="mt-1 block text-sm text-white/60">{match.status==='completed'?'Risultato da confermare':`Set ${match.score.currentSet} · ${match.score.games.A}–${match.score.games.B}`}</span>{pending>0&&<span className="mt-2 inline-flex rounded-full bg-[var(--event-primary)] px-2 py-1 text-xs font-black text-black">{pending} carta richiesta</span>}</> : <span className="mt-1 block text-sm text-white/55">In attesa</span>}</button> })}
  </main></MobileRoleShell>
  return <RefereePreparationView tournament={tournament} courtId={selectedCourtId} error={error} headerAction={headerAction} />
}

function RefereePreparationView({ tournament, courtId, isLoading, error, headerAction }: { tournament: ReturnType<typeof useTournament>['data']; courtId: string; isLoading?: boolean; error?: string; headerAction?: ReactNode }) {
  const assigned = tournament.matches.filter(match => match.courtId === courtId)
  const [selectedId, setSelectedId] = useState('')
  const [lifecycleFeedback, setLifecycleFeedback] = useState('')
  const live = useLiveOrchestrationRepository(tournament.id)
  if (isLoading) return <MobileRoleShell title="Area arbitro" action={headerAction}><main className="p-4"><p>Caricamento partite…</p></main></MobileRoleShell>
  if (error) return <MobileRoleShell title="Area arbitro" action={headerAction}><main className="p-4"><EmptyState title="Impossibile caricare la partita" /></main></MobileRoleShell>
  if (!courtId) return <MobileRoleShell title="Area arbitro" action={headerAction}><main className="p-4"><EmptyState title="Nessun campo assegnato" /></main></MobileRoleShell>
  const match = assigned.find(item => item.id === selectedId) ?? assigned.find(item => item.status !== 'completed' || !item.resultConfirmedAt) ?? assigned[0]
  const court = tournament.courts.find(item => item.id === courtId)
  if (!match) return <MobileRoleShell title={court?.name ?? 'Campo'} action={headerAction}><main className="p-4"><EmptyState title="Nessuna partita assegnata" /></main></MobileRoleShell>
  const teamA = tournament.teams.find(item => item.id === match.teamAId)
  const teamB = tournament.teams.find(item => item.id === match.teamBId)
  const round = tournament.rounds?.find(item => item.id === match.roundId)
  const cardsReady = tournament.cardsEnabled===false||Boolean(round?.cardReadinessReady)
  const canStartSet2 = Boolean(round?.diceResult && match.set1EndedAt && getPersistedSetResult(tournament, match.id, 1))
  const control = async (action: SetAction, success: string) => {
    setLifecycleFeedback('')
    try { await live.controlRefereeMatch(match.id, action); setLifecycleFeedback(success) }
    catch (cause) { setLifecycleFeedback(cause instanceof Error ? cause.message : 'Operazione non riuscita.') }
  }
  return <MobileRoleShell title={court?.name ?? 'Campo'} status={match.status} action={headerAction}><CardPlayNotification tournament={tournament} matchIds={[match.id]}/><LiveEventPresenter tournament={tournament} audience="referee" matchIds={[match.id]} courtId={match.courtId}/>
    <GlobalDiceReveal tournament={tournament} />
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <header><p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">{court?.name ?? 'Campo assegnato'}</p><h1 className="mt-2 text-3xl font-black">{teamA?.name} vs {teamB?.name}</h1><p className="text-white/55">{round?.name ?? 'Turno'} · {tournament.groups.find(group => group.id === match.groupId)?.name ?? 'Girone'}</p></header>
      {assigned.length > 1 ? <label className="grid gap-1 text-sm font-bold text-white/55">Partita<select className="rounded border border-white/10 bg-black px-3 py-3 text-white" value={match.id} onChange={event => setSelectedId(event.target.value)}>{assigned.map(item => { const a=tournament.teams.find(team=>team.id===item.teamAId); const b=tournament.teams.find(team=>team.id===item.teamBId); return <option key={item.id} value={item.id}>{a?.shortName} vs {b?.shortName} · {item.status}</option> })}</select></label> : null}
      <Readiness match={match} teams={[teamA, teamB]} />
      <RefereeLiveMatch tournament={tournament} match={match} teamA={teamA} teamB={teamB} />
      <ActiveDiceIndicator tournament={tournament} match={match} />
      <ActiveCardEffects tournament={tournament} match={match} />
      {tournament.setControlMode === 'referee' ? <section className="grid gap-2 rounded border border-white/10 bg-[#171717] p-5">
        {!round?.openedAt ? <p className="font-bold text-amber-100">In attesa dell’apertura del turno da parte della Regia.</p> : <>
          {['scheduled', 'ready'].includes(match.status) && <><button className="rounded bg-[var(--event-primary)] px-4 py-4 font-black text-black disabled:opacity-40" disabled={live.isPending||!cardsReady} onClick={() => void control('start_set_1', 'Set 1 avviato.')}>AVVIA SET</button>{!cardsReady&&<p className="text-sm font-bold text-amber-200">In attesa dell’assegnazione carte da parte della Regia.</p>}</>}
          {match.status === 'live_set_1' && <button className="rounded bg-white/10 px-4 py-4 font-black" disabled={live.isPending} onClick={() => window.confirm('TERMINARE IL SET IN ANTICIPO?') && void control('end_set_1', 'Set 1 terminato.')}>TERMINA SET IN ANTICIPO</button>}
          {match.status === 'set_break' && <><button className="rounded bg-[var(--event-primary)] px-4 py-4 font-black text-black" disabled={live.isPending || !canStartSet2} onClick={() => void control('start_set_2', 'Set 2 avviato.')}>AVVIA SET</button>{!canStartSet2 && <p className="text-sm font-bold text-amber-200">In attesa del risultato del Set 1 e del dado globale della Regia.</p>}</>}
          {match.status === 'live_set_2' && <button className="rounded bg-white/10 px-4 py-4 font-black" disabled={live.isPending} onClick={() => window.confirm('TERMINARE IL SET IN ANTICIPO?') && void control('end_set_2', 'Set 2 terminato.')}>TERMINA SET IN ANTICIPO</button>}
        </>}
        {(lifecycleFeedback || live.error) && <p className="rounded bg-white/10 p-3 font-bold">{lifecycleFeedback || live.error}</p>}
      </section> : <p className="rounded border border-white/10 bg-[#171717] p-4 font-black text-amber-100">IN ATTESA DELLA REGIA</p>}
    </main>
  </MobileRoleShell>
}

export function RefereeLiveMatch({ tournament, match, teamA, teamB }: { tournament: Tournament; match: Match; teamA?: Team; teamB?: Team }) {
  const live = useLiveMatchRepository(tournament.id)
  const [correctionOpen,setCorrectionOpen]=useState(false)
  const [gamesA,setGamesA]=useState(match.score.games.A)
  const [gamesB,setGamesB]=useState(match.score.games.B)
  const [confirmCorrection,setConfirmCorrection]=useState(false)
  const [managedCardId,setManagedCardId]=useState('')
  const [selectedPlayerId,setSelectedPlayerId]=useState('')
  const [feedback,setFeedback]=useState('')
  const now=useSharedClock()
  const expiryRequested=useRef('')
  const diceEffect=getDiceEffect(tournament,match,now)
  const activeSet=match.status==='live_set_1'||match.status==='live_set_2'
  const timer=getSetTimer(match,now)
  const reviewSet:1|2|undefined=!match.set1ResultSubmittedAt&&match.set1EndedAt?1:!match.set2ResultSubmittedAt&&match.set2EndedAt?2:undefined
  const reviewedResult=reviewSet?getPersistedSetResult(tournament,match.id,reviewSet):undefined
  const pending=tournament.teamCards.filter(card=>card.matchId===match.id&&card.state==='pending')
  const refereeScoreEnabled=tournament.refereeCanManageScore!==false
  const active=tournament.teamCards.filter(card=>card.matchId===match.id&&card.state==='active'&&(!card.expiresAt||new Date(card.expiresAt).getTime()>now))
  const managed=pending.find(card=>card.id===managedCardId)
  useEffect(()=>{ setGamesA(match.score.games.A); setGamesB(match.score.games.B) },[match.id,match.score.games.A,match.score.games.B])
  const run=async(action:()=>Promise<unknown>,success:string)=>{ setFeedback(''); try{ await action(); setFeedback(success) }catch(cause){ setFeedback(cause instanceof Error?cause.message:'Operazione non riuscita.') } }
  const definition=(card:TeamCard)=>tournament.cards.find(item=>item.id===card.cardId)
  const requestingTeam=managed?tournament.teams.find(team=>team.id===managed.teamId):undefined
  const lineup=managed?match.lineups.find(item=>item.teamId===managed.teamId&&item.setNumber===match.score.currentSet):undefined
  const selectablePlayers=lineup?.activePlayerIds.map(id=>requestingTeam?.players.find(player=>player.id===id)).filter((player):player is NonNullable<typeof player>=>Boolean(player))??[]
  const needsPlayer=managed?isChosenPlayerCard(definition(managed)):false
  const activeEvent=tournament.globalEvents.find(event=>event.status==='active')
  const eventPlayers=match.lineups.filter(item=>item.setNumber===match.score.currentSet).flatMap(item=>{
    const team=tournament.teams.find(candidate=>candidate.id===item.teamId)
    return item.activePlayerIds.map(id=>team?.players.find(player=>player.id===id)).filter((player):player is NonNullable<typeof player>=>Boolean(player))
  })
  useEffect(()=>{
    const requestKey=timer?`${match.id}:${timer.setNumber}`:''
    if(!timer?.expired||!activeSet||expiryRequested.current===requestKey)return
    expiryRequested.current=requestKey
    void live.expireSet(match.id).then(()=>setFeedback('TEMPO SCADUTO. Verifica e invia il risultato del set.')).catch(cause=>{
      expiryRequested.current=''
      setFeedback(cause instanceof Error?cause.message:'Operazione non riuscita.')
    })
  },[activeSet,live,match.id,timer?.expired,timer?.setNumber])
  return <section className="space-y-4">
    <SetTimer match={match} size="large" />
    {timer?.expired&&<div className="rounded border border-red-400/60 bg-red-500/20 p-5 text-center text-2xl font-black text-red-100">TEMPO SCADUTO</div>}
    {diceEffect.rule && match.status === 'live_set_2' && <div className="rounded border border-amber-400/35 bg-amber-400/10 p-4"><p className="text-xs font-black uppercase text-amber-200">Dado globale · {diceEffect.rule.value}</p><h2 className="mt-1 text-xl font-black">{diceEffect.rule.title}</h2><p className="text-sm text-white/65">{diceEffect.rule.description}</p>{diceEffect.active && <p className="mt-2 text-2xl font-black text-amber-200">{formatCountdown(diceEffect.remainingSeconds)}</p>}</div>}
    <div className="rounded border border-[var(--event-primary)]/35 bg-[#171717] p-4">
      <div className="text-center"><p className="text-sm font-black uppercase tracking-[.16em] text-[var(--event-primary)]">{reviewSet?`RISULTATO SET ${reviewSet}`:`Set ${match.score.currentSet} · ${activeSet?'In corso':'Non attivo'}`}</p><div className="mt-4 grid grid-cols-2 gap-3"><ScoreTeam team={teamA} games={reviewedResult?.gamesA??match.score.games.A} disabled={!activeSet||!refereeScoreEnabled||live.isPending} onGame={()=>void run(()=>live.incrementGame(match.id,match.teamAId),'Punteggio aggiornato.')} /><ScoreTeam team={teamB} games={reviewedResult?.gamesB??match.score.games.B} disabled={!activeSet||!refereeScoreEnabled||live.isPending} onGame={()=>void run(()=>live.incrementGame(match.id,match.teamBId),'Punteggio aggiornato.')} /></div><button type="button" disabled={(!activeSet&&!reviewSet)||!refereeScoreEnabled||live.isPending} onClick={()=>{setGamesA(reviewedResult?.gamesA??match.score.games.A);setGamesB(reviewedResult?.gamesB??match.score.games.B);setConfirmCorrection(false);setCorrectionOpen(true)}} className="mt-4 min-h-11 px-4 text-sm font-black underline disabled:opacity-40">MODIFICA RISULTATO</button>{reviewSet&&<button disabled={live.isPending} className="mt-3 min-h-12 w-full rounded bg-[var(--event-primary)] px-4 font-black text-black" onClick={()=>void run(()=>live.submitSetResult(match.id,reviewSet),'Risultato inviato alla Regia.')}>INVIA RISULTATO ALLA REGIA</button>}</div>
      {(feedback||live.error)&&<p className="mt-3 rounded bg-white/10 p-3 text-sm font-bold">{feedback||live.error}</p>}
    </div>
    {correctionOpen&&<div role="dialog" aria-modal="true" aria-label="Correggi risultato" className="fixed inset-0 z-[1800] grid items-end bg-black/75 sm:place-items-center"><div className="w-full rounded-t-2xl bg-[#171717] p-5 sm:max-w-md sm:rounded-2xl"><h2 className="text-2xl font-black">MODIFICA RISULTATO</h2>{confirmCorrection?<p className="mt-4 text-white/75">Confermi il punteggio {gamesA}–{gamesB}?</p>:<div className="mt-5 grid gap-4"><ScoreStepper label={teamA?.name??'Team A'} value={gamesA} onChange={setGamesA}/><ScoreStepper label={teamB?.name??'Team B'} value={gamesB} onChange={setGamesB}/></div>}<div className="mt-6 grid grid-cols-2 gap-3"><button className="min-h-12 rounded bg-white/10 font-black" onClick={()=>setCorrectionOpen(false)}>ANNULLA</button><button disabled={live.isPending} className="min-h-12 rounded bg-[var(--event-primary)] font-black text-black disabled:opacity-50" onClick={()=>{ if(!confirmCorrection){setConfirmCorrection(true);return} const operation=reviewSet?()=>live.saveSetResult(match.id,reviewSet,gamesA,gamesB):()=>live.setScore(match.id,gamesA,gamesB); void run(operation,'Risultato salvato.').then(()=>setCorrectionOpen(false)) }}>CONFERMA MODIFICA</button></div></div></div>}
    {pending.length>0&&<div className="rounded border border-[var(--event-primary)]/50 bg-[var(--event-primary)]/10 p-4"><h2 className="flex items-center gap-2 text-xl font-black"><CreditCard className="text-[var(--event-primary)]"/>CARTA GIOCATA · {pending.length}</h2><div className="mt-3 grid gap-3">{pending.map(card=>{const cardDefinition=definition(card);const team=tournament.teams.find(item=>item.id===card.teamId);return <article key={card.id} className="rounded bg-black/40 p-4"><p className="text-xs font-black uppercase text-[var(--event-primary)]">{team?.name}</p><h3 className="mt-1 text-xl font-black">{cardDefinition?.name}</h3><p className="mt-1 text-sm text-white/65">{cardDefinition?.description}</p><button className="mt-3 min-h-11 rounded bg-[var(--event-primary)] px-4 font-black text-black" onClick={()=>{setManagedCardId(card.id);setSelectedPlayerId('')}}>GESTISCI</button></article>})}</div></div>}
    {managed&&<div role="dialog" aria-modal="true" aria-label="Gestisci carta" className="fixed inset-0 z-[1800] grid items-end bg-black/75 sm:place-items-center"><div className="w-full rounded-t-2xl bg-[#171717] p-5 sm:max-w-md sm:rounded-2xl"><p className="text-xs font-black uppercase text-[var(--event-primary)]">Carta richiesta · {requestingTeam?.name}</p><h2 className="mt-1 text-2xl font-black">{definition(managed)?.name}</h2><p className="mt-3 text-white/70">{definition(managed)?.longDescription||definition(managed)?.description}</p>{needsPlayer&&<fieldset className="mt-5 grid gap-2"><legend className="mb-2 font-black">Scegli il Prescelto</legend>{selectablePlayers.map(player=><label key={player.id} className="flex min-h-12 items-center gap-3 rounded bg-white/[.06] px-3"><input type="radio" name="chosen-player" checked={selectedPlayerId===player.id} onChange={()=>setSelectedPlayerId(player.id)}/><span className="font-bold">{player.name}</span></label>)}</fieldset>}<div className="mt-6 grid gap-2"><button disabled={live.isPending||(needsPlayer&&!selectedPlayerId)} className="min-h-12 rounded bg-[var(--event-primary)] font-black text-black disabled:opacity-40" onClick={()=>void run(()=>live.confirmCard(managed.id,selectedPlayerId||undefined),'Carta confermata.').then(()=>setManagedCardId(''))}>CONFERMA CARTA</button><button disabled={live.isPending} className="min-h-11 rounded bg-white/10 font-black" onClick={()=>void run(()=>live.rejectCard(managed.id),'Richiesta annullata.').then(()=>setManagedCardId(''))}>ANNULLA RICHIESTA</button><button className="min-h-11 font-bold text-white/60" onClick={()=>setManagedCardId('')}>Chiudi</button></div></div></div>}
    {active.length>0&&<div className="grid gap-2">{active.map(card=>{const d=definition(card);return <article key={card.id} className="rounded border border-emerald-400/30 bg-emerald-500/10 p-4"><p className="text-xs font-black uppercase text-emerald-200">Carta attiva</p><div className="mt-1 flex items-end justify-between gap-3"><div><h3 className="text-xl font-black">{d?.name}</h3><p className="text-sm text-white/60">{tournament.teams.find(team=>team.id===card.teamId)?.name}</p></div>{card.expiresAt&&<p className="text-3xl font-black text-emerald-200">{formatRemaining(card.expiresAt,now)}</p>}</div></article>})}</div>}
    {activeEvent&&tournament.refereeCanReportEventWinner!==false&&tournament.specialEventsEnabled!==false&&<section className="rounded border border-fuchsia-400/40 bg-fuchsia-500/10 p-4"><p className="text-xs font-black uppercase text-fuchsia-200">Evento speciale attivo</p><h2 className="mt-1 text-xl font-black">{activeEvent.title}</h2><p className="mt-1 text-sm text-white/65">Segnala il candidato alla Regia. La conferma finale spetta alla Regia.</p><div className="mt-3 grid grid-cols-2 gap-2">{eventPlayers.map(player=><button key={player.id} disabled={live.isPending} className="min-h-11 rounded bg-white/10 px-2 font-bold" onClick={()=>void run(()=>live.reportEventWinner(match.id,player.id),'Segnalazione inviata alla Regia.')}>{player.name}</button>)}</div></section>}
    <FinalResultConfirmation tournament={tournament} match={match} teamA={teamA} teamB={teamB} live={live} run={run} />
  </section>
}

function FinalResultConfirmation({tournament,match,teamA,teamB,live,run}:{tournament:Tournament;match:Match;teamA?:Team;teamB?:Team;live:ReturnType<typeof useLiveMatchRepository>;run:(action:()=>Promise<unknown>,success:string)=>Promise<void>}) {
  const [scoreA,setScoreA]=useState(match.superTiebreakA??0); const [scoreB,setScoreB]=useState(match.superTiebreakB??0)
  const history=setHistory(tournament,match); const ready=Boolean(match.set2ResultSubmittedAt)&&!match.resultConfirmedAt
  if(!ready)return match.resultConfirmedAt?<section className="rounded border border-emerald-400/40 bg-emerald-400/10 p-4 text-center font-black text-emerald-100">RISULTATO CONFERMATO · PARTITA TERMINATA</section>:null
  const needsStb=match.score.sets.A===match.score.sets.B||match.score.currentSet===3
  return <section className="rounded border border-[var(--event-primary)]/45 bg-[#171717] p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--event-primary)]">RISULTATO FINALE</p><h2 className="mt-1 text-xl font-black">{teamA?.name} vs {teamB?.name}</h2><div className="mt-3 grid gap-1">{history.map(item=><p key={item.set} className="font-bold">Set {item.set}: {item.gamesA}–{item.gamesB}</p>)}</div>{needsStb&&<div className="mt-4 grid grid-cols-2 gap-3"><p className="col-span-2 rounded bg-amber-500/15 p-3 text-center font-black text-amber-100">SUPER TIE-BREAK NECESSARIO</p><ScoreStepper label={teamA?.name??'Team A'} value={scoreA} onChange={setScoreA}/><ScoreStepper label={teamB?.name??'Team B'} value={scoreB} onChange={setScoreB}/><button disabled={live.isPending||scoreA===scoreB} className="col-span-2 min-h-11 rounded bg-white/10 font-black disabled:opacity-40" onClick={()=>void run(()=>live.setSuperTiebreakScore(match.id,scoreA,scoreB),'Super Tie-Break salvato.')}>SALVA RISULTATO SUPER TIE-BREAK</button></div>}<button disabled={live.isPending||(needsStb&&(scoreA===scoreB||match.superTiebreakA===undefined))} className="mt-5 min-h-14 w-full rounded bg-[var(--event-primary)] px-4 text-lg font-black text-black disabled:opacity-40" onClick={()=>void run(()=>live.confirmResult(match.id),'Risultato confermato. PARTITA TERMINATA.')}>CONFERMA RISULTATO PARTITA</button></section>
}

function ScoreTeam({team,games,disabled,onGame}:{team?:Team;games:number;disabled:boolean;onGame:()=>void}){return <div className="min-w-0"><p className="truncate font-black">{team?.shortName??'Team'}</p><p className="my-2 text-6xl font-black leading-none">{games}</p><button disabled={disabled} onClick={onGame} className="min-h-16 w-full rounded bg-[var(--event-primary)] px-2 text-lg font-black text-black disabled:opacity-40">+ GAME</button></div>}
function ScoreStepper({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}){return <div><p className="mb-2 font-black">{label}</p><div className="grid grid-cols-[48px_1fr_48px] items-center gap-3"><button aria-label={`Riduci ${label}`} className="size-12 rounded bg-white/10 text-2xl font-black" onClick={()=>onChange(Math.max(0,value-1))}>−</button><output className="text-center text-4xl font-black">{value}</output><button aria-label={`Aumenta ${label}`} className="size-12 rounded bg-white/10 text-2xl font-black" onClick={()=>onChange(Math.min(99,value+1))}>+</button></div></div>}
function isChosenPlayerCard(card?:CardDefinition){return Boolean(card&&(card.slug==='il-prescelto'||card.name.toLocaleLowerCase('it')==='il prescelto'))}
export function formatRemaining(expiresAt:string,now=Date.now()){const seconds=Math.max(0,Math.ceil((new Date(expiresAt).getTime()-now)/1000));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`}

function Readiness({ match, teams }: { match: ReturnType<typeof useTournament>['data']['matches'][number]; teams: Array<ReturnType<typeof useTournament>['data']['teams'][number] | undefined> }) {
  const ready = teams.every(team => team && [1, 2, 3].every(setNumber => match.lineups.some(lineup => lineup.teamId === team.id && lineup.setNumber === setNumber)))
  const firstMissing = teams.flatMap(team => team ? [1, 2].filter(setNumber => !match.lineups.some(lineup => lineup.teamId === team.id && lineup.setNumber === setNumber)).map(setNumber => `${team.name} · Set ${setNumber}`) : [])[0]
  return <section className="rounded border border-white/10 bg-[#171717] p-5"><h2 className="text-xl font-black">Formazioni</h2><p className={`mt-3 rounded p-3 font-bold ${ready ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-100'}`}>{ready ? '✓ Entrambe le squadre sono pronte' : `In attesa della formazione ${firstMissing ?? ''}`}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{teams.map(team => team ? <article key={team.id} className="rounded bg-black/30 p-4"><h3 className="text-lg font-black">{team.name}</h3>{[1,2,3].map(setNumber => { const lineup=match.lineups.find(item=>item.teamId===team.id&&item.setNumber===setNumber); return <div key={setNumber} className="mt-3"><p className="text-xs font-black uppercase text-white/45">{setNumber === 3 ? 'Eventuale Super Tie-Break' : `Set ${setNumber}`}</p><p className="font-bold">{lineup ? lineup.activePlayerIds.map(id => team.players.find(player => player.id === id)?.name ?? 'Giocatore').join(' + ') : 'Formazione non ancora confermata'}</p></div>})}</article> : null)}</div></section>
}

function Action({ icon: Icon, label, disabled = false, onClick }: { icon: typeof RotateCcw; label: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className="inline-flex min-h-16 items-center justify-center gap-2 rounded border border-white/10 bg-[#171717] px-3 py-4 font-black disabled:opacity-40">
      <Icon className="size-5 text-[var(--event-primary)]" />
      {label}
    </button>
  )
}
