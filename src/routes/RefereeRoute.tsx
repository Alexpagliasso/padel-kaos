import { Alert } from '@mui/material'
import { dataProvider } from '../repositories'
import { canPreviewAsAdmin } from '../features/admin/preview/previewPolicy'
import { useAuth } from '../features/auth/authContext'
import { MatchReportSubmission } from '../features/admin/reports/MatchReportSubmission'
import { MatchTimer } from '../shared/components/MatchTimer'
import { useEffect, useState, type ReactNode } from 'react'
import { Bolt, Dice5, RotateCcw, Trophy, Undo2 } from 'lucide-react'
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
  if (!selectedCourtId) return <MobileRoleShell title="Seleziona campo" action={headerAction}><main className="grid gap-3 p-4">
    <h1 className="text-2xl font-black">Seleziona campo</h1>
    {courtIds.map((id) => <button key={id} className="rounded bg-[var(--event-primary)] px-4 py-4 font-black text-black" onClick={() => setSelectedCourtId(id)}>{tournament.courts.find((court) => court.id === id)?.name ?? 'Campo'}</button>)}
  </main></MobileRoleShell>
  return <RefereePreparationView tournament={tournament} courtId={selectedCourtId} error={error} headerAction={headerAction} />
}

function RefereePreparationView({ tournament, courtId, isLoading, error, headerAction }: { tournament: ReturnType<typeof useTournament>['data']; courtId: string; isLoading?: boolean; error?: string; headerAction?: ReactNode }) {
  const assigned = tournament.matches.filter(match => match.courtId === courtId)
  const [selectedId, setSelectedId] = useState('')
  if (isLoading) return <MobileRoleShell title="Area arbitro" action={headerAction}><main className="p-4"><p>Caricamento partite…</p></main></MobileRoleShell>
  if (error) return <MobileRoleShell title="Area arbitro" action={headerAction}><main className="p-4"><EmptyState title="Impossibile caricare la partita" /></main></MobileRoleShell>
  if (!courtId) return <MobileRoleShell title="Area arbitro" action={headerAction}><main className="p-4"><EmptyState title="Nessun campo assegnato" /></main></MobileRoleShell>
  const match = assigned.find(item => item.id === selectedId) ?? assigned.find(item => item.status !== 'completed') ?? assigned[0]
  const court = tournament.courts.find(item => item.id === courtId)
  if (!match) return <MobileRoleShell title={court?.name ?? 'Campo'} action={headerAction}><main className="p-4"><EmptyState title="Nessuna partita assegnata" /></main></MobileRoleShell>
  const teamA = tournament.teams.find(item => item.id === match.teamAId)
  const teamB = tournament.teams.find(item => item.id === match.teamBId)
  const round = tournament.rounds?.find(item => item.id === match.roundId)
  return <MobileRoleShell title={court?.name ?? 'Campo'} status={match.status} action={headerAction}>
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
      <header><p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">{court?.name ?? 'Campo assegnato'}</p><h1 className="mt-2 text-3xl font-black">{teamA?.name} vs {teamB?.name}</h1><p className="text-white/55">{round?.name ?? 'Turno'} · {tournament.groups.find(group => group.id === match.groupId)?.name ?? 'Girone'}</p></header>
      {assigned.length > 1 ? <label className="grid gap-1 text-sm font-bold text-white/55">Partita<select className="rounded border border-white/10 bg-black px-3 py-3 text-white" value={match.id} onChange={event => setSelectedId(event.target.value)}>{assigned.map(item => { const a=tournament.teams.find(team=>team.id===item.teamAId); const b=tournament.teams.find(team=>team.id===item.teamBId); return <option key={item.id} value={item.id}>{a?.shortName} vs {b?.shortName} · {item.status}</option> })}</select></label> : null}
      <Readiness match={match} teams={[teamA, teamB]} />
    </main>
  </MobileRoleShell>
}

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
