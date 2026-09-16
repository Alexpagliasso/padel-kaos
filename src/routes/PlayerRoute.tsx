import { canPreviewAsAdmin } from '../features/admin/preview/previewPolicy'
import { useState, type ReactNode } from 'react'
import { CreditCard, Radio, Swords, Table2 } from 'lucide-react'
import { MobileRoleShell } from '../shared/components/Foundation'
import { RoleShell } from '../shared/components/RoleShell'
import { Scoreboard } from '../shared/components/Scoreboard'
import { LineupStrip } from '../shared/components/LineupStrip'
import { AnimatedCardReveal } from '../shared/components/AnimatedCardReveal'
import { GlobalEventOverlay } from '../shared/components/GlobalEventOverlay'
import { EventPresentationOverlay } from '../shared/components/EventPresentationOverlay'
import { MatchTile } from '../features/live/MatchTile'
import { useRoleTournament as useTournament } from '../features/admin/preview/useRoleTournament'
import { getDiceRuleForMatch } from '../features/tournament/selectors'
import { validateMatchLineup } from '../domain/rules/rulesEngine'
import { useDemoStore } from '../demo/demoStore'
import { useEventRepository } from '../repositories/eventRepository'
import { dataProvider } from '../repositories'
import { useAuth } from '../features/auth/authContext'
import { resolvePlayerRouteState, type PlayerRouteState } from './playerRouteState'
import type { DemoEvent } from '../demo/demoTypes'
import type { Tournament } from '../shared/types/domain'
import { getPlayerDisplayName } from '../shared/lib/playerNames'
import { useLineupRepository } from '../repositories/lineupRepository'
import { LogoutButton } from '../features/auth/LogoutButton'

export function PlayerRoute() {
  const { data: tournament, isLoading, error } = useTournament()
  const events = useEventRepository().events
  const { profile, status: authStatus } = useAuth()
  const adminPreview = canPreviewAsAdmin(authStatus, profile?.role)
  const selectedTeamId = useDemoStore((state) => state.selectedTeamId)
  const selectTeam = useDemoStore((state) => state.selectTeam)
  const playCard = useDemoStore((state) => state.playCard)
  const logoutAction = profile?.role === 'team' ? <LogoutButton minimal /> : undefined

  const routeState = resolvePlayerRouteState({
    provider: adminPreview ? 'demo' : dataProvider,
    tournament,
    isLoading,
    repositoryError: error,
    profile,
    demoSelectedTeamId: adminPreview && !tournament.teams.some(team => team.id === selectedTeamId) ? tournament.teams[0]?.id ?? '' : selectedTeamId,
  })

  if (routeState.type === 'loading') {
    return (
      <RoleShell action={logoutAction}>
        <main className="mx-auto grid min-h-[70svh] max-w-5xl place-items-center px-4 text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Caricamento area giocatore</p>
        </main>
      </RoleShell>
    )
  }

  if (routeState.type === 'error') {
    return (
      <RoleShell action={logoutAction}>
        <main className="mx-auto grid min-h-[70svh] max-w-5xl place-items-center px-4 text-center">
          <section className="max-w-xl rounded border border-white/10 bg-[#171717] p-6">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Area giocatore non disponibile</p>
            <h1 className="mt-3 text-3xl font-black">{routeState.title}</h1>
            <p className="mt-3 text-white/60">{routeState.message}</p>
          </section>
        </main>
      </RoleShell>
    )
  }

  return (
    <PlayerRouteContent
      tournament={tournament}
      events={events}
      routeState={routeState}
      onSelectDemoTeam={selectTeam}
      onPlayDemoCard={(teamCardId) => adminPreview && dataProvider === 'supabase' ? 'Read-only admin preview' : playCard(teamCardId).message}
      headerAction={logoutAction}
    />
  )
}

export function PlayerRouteContent({
  tournament,
  events,
  routeState,
  onSelectDemoTeam,
  onPlayDemoCard,
  headerAction,
}: {
  tournament: Tournament
  events: DemoEvent[]
  routeState: Extract<PlayerRouteState, { type: 'ready' }>
  onSelectDemoTeam: (teamId: string) => void
  onPlayDemoCard: (teamCardId: string) => string
  headerAction?: ReactNode
}) {
  const [feedback, setFeedback] = useState('')
  const [selectedMatchId, setSelectedMatchId] = useState(routeState.match.id)
  const { playerTeam, matches, cards, greetingName, showDemoTeamSelector } = routeState
  const match = matches.find(item => item.id === selectedMatchId) ?? routeState.match
  const teamA = tournament.teams.find(team => team.id === match.teamAId)
  const teamB = tournament.teams.find(team => team.id === match.teamBId)
  const diceRule = getDiceRuleForMatch(tournament, match)
  const globalEvent = tournament.globalEvents.find((event) => event.status === 'active' || event.status === 'completed')
  const isKaosPending = match.status === 'kaos_pending' || match.status === 'kaos_reveal'

  return (
    <MobileRoleShell title={playerTeam.name} status={tournament.status ?? match.status} action={headerAction}>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-5">
        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">
              {showDemoTeamSelector ? 'DEMO GIOCATORE' : 'AREA GIOCATORE'}
            </p>
            <h1 className="text-3xl font-black">Ciao {greetingName}</h1>
            <p className="text-white/55">{playerTeam.name}{showDemoTeamSelector ? ' Â· vista simulatore' : ''}</p>
          </div>
          {matches.length > 1 ? (
            <label className="grid gap-1 text-sm font-bold text-white/55">
              Partita
              <select className="rounded border border-white/10 bg-black px-3 py-3 text-white" value={match.id} onChange={(event) => setSelectedMatchId(event.target.value)}>
                {matches.map((item) => {
                  const opponent = tournament.teams.find(team => team.id === (item.teamAId === playerTeam.id ? item.teamBId : item.teamAId))
                  const round = tournament.rounds?.find(value => value.id === item.roundId)
                  return <option key={item.id} value={item.id}>{round?.name ?? 'Turno'} Â· {opponent?.name ?? 'Avversario'} Â· {item.status === 'completed' ? 'Terminata' : 'Da giocare'}</option>
                })}
              </select>
            </label>
          ) : null}
          {showDemoTeamSelector ? (
            <label className="grid gap-1 text-sm font-bold text-white/55">
              View as
              <select className="rounded border border-white/10 bg-black px-3 py-3 text-white" value={playerTeam.id} onChange={(event) => onSelectDemoTeam(event.target.value)}>
                {tournament.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        <EventPresentationOverlay events={events} />
        {isKaosPending ? (
          <section className="mt-5 rounded border border-[var(--event-primary)]/40 bg-[var(--event-primary)]/10 p-6 text-center">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--event-primary)]">KAOS TIME</p>
            <h2 className="mt-2 text-4xl font-black">In attesa del lancio del dado</h2>
          </section>
        ) : null}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <section id="match" className="space-y-5">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">{match.status === 'completed' ? 'Partita terminata' : 'Prossima partita'}</p><p className="mt-1 font-bold">{tournament.rounds?.find(round => round.id === match.roundId)?.name ?? 'Turno'} · {tournament.courts.find(court => court.id === match.courtId)?.name ?? 'Campo da assegnare'} · {tournament.groups.find(group => group.id === match.groupId)?.name ?? 'Girone'}</p></div>
            <Scoreboard match={match} teamA={teamA} teamB={teamB} />
            <LineupStrip match={match} teamA={teamA} teamB={teamB} />
            <TeamLineupPreparation key={match.id} tournament={tournament} team={playerTeam} match={match} />
            {diceRule ? (
              <div className="rounded border border-[var(--event-primary)]/30 bg-[var(--event-primary)]/10 p-4">
                <p className="text-sm font-black uppercase text-[var(--event-primary)]">Kaos Rule</p>
                <p className="text-xl font-black">{diceRule.title}</p>
                <p className="text-sm text-white/65">{diceRule.description}</p>
              </div>
            ) : null}
            <GlobalEventOverlay event={globalEvent} />
          </section>
          <section id="cards" className="space-y-4">
            <h2 className="text-xl font-black">Le tue carte</h2>
            {feedback ? <p className="rounded bg-[var(--event-primary)]/10 p-3 font-bold text-[var(--event-primary)]">{feedback}</p> : null}
            {cards.map((teamCard) => {
              const card = tournament.cards.find((item) => item.id === teamCard.cardId)
              return card ? (
                <div key={teamCard.id} className="space-y-3">
                  <AnimatedCardReveal card={card} teamCard={teamCard} />
                  <button
                    className="w-full rounded bg-[var(--event-primary)] px-4 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!showDemoTeamSelector || teamCard.state !== 'available'}
                    onClick={() => {
                      if (!showDemoTeamSelector) return
                      setFeedback(onPlayDemoCard(teamCard.id))
                    }}
                  >
                    Play Card
                  </button>
                </div>
              ) : null
            })}
          </section>
        </div>
        <section id="group" className="mt-6 rounded border border-white/10 bg-[#171717] p-5">
          <h2 className="text-xl font-black">Girone / {tournament.groups.find(group => group.id === playerTeam.groupId)?.name ?? 'Da definire'}</h2>
          <div className="mt-4 grid gap-3">{tournament.teams.filter(team => team.groupId === playerTeam.groupId).map(team => <div key={team.id} className="flex justify-between gap-3">
            <span>{team.name}</span>
            <span>{tournament.standings.find(standing => standing.teamId === team.id)?.points ?? 0} pts</span>
          </div>)}</div>
        </section>
        <section id="live" className="mt-6 grid gap-4 md:grid-cols-2">
          {tournament.matches.map((liveMatch) => (
            <MatchTile key={liveMatch.id} match={liveMatch} tournament={tournament} />
          ))}
        </section>
      </main>
      <nav aria-label="Sezioni squadra" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#0B0B0B]/95 px-2 py-2 backdrop-blur md:hidden">
        {[
          { label: 'Partita', icon: Swords },
          { label: 'Carte', icon: CreditCard },
          { label: 'Group', icon: Table2 },
          { label: 'In corso', icon: Radio },
        ].map((item) => (
          <a href={`#${item.label.toLowerCase()}`} key={item.label} className="grid place-items-center gap-1 rounded py-2 text-xs font-bold text-white/70">
            <item.icon className="size-5 text-[var(--event-primary)]" />
            {item.label}
          </a>
        ))}
      </nav>
    </MobileRoleShell>
  )
}

function TeamLineupPreparation({ tournament, team, match }: { tournament: Tournament; team: Tournament['teams'][number]; match: Tournament['matches'][number] }) {
  const repository = useLineupRepository()
  const [phase, setPhase] = useState<1 | 2>(match.lineups.some(item => item.teamId === team.id && item.setNumber === 1) ? 2 : 1)
  const persisted = match.lineups.find(item => item.teamId === team.id && item.setNumber === phase)
  const [selected, setSelected] = useState<string[]>(persisted?.activePlayerIds ?? [])
  const [feedback, setFeedback] = useState('')
  const used = match.lineups.filter(item => item.teamId === team.id && item.setNumber !== phase && item.setNumber < 3)
  const validation = validateMatchLineup({ candidate: { activePlayerIds: selected }, usedLineups: used, roster: team.players })
  const locked = match.status === 'completed' || (phase === 1 && !['scheduled', 'ready', 'lineup'].includes(match.status)) || (phase === 2 && match.status === 'live_set_2')
  const findLineup = (setNumber: number) => match.lineups.find(item => item.teamId === team.id && item.setNumber === setNumber)
  const stb = findLineup(3)
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 2 ? [...current, id] : [current[1], id])
  const choosePhase = (value: 1 | 2) => { setPhase(value); setSelected(findLineup(value)?.activePlayerIds ?? []); setFeedback('') }
  const save = async () => {
    if (!validation.valid || selected.length !== 2) return
    setFeedback('')
    try {
      await repository.confirm({ tournamentId: tournament.id, matchId: match.id, teamId: team.id, setNumber: phase, playerIds: [selected[0], selected[1]] })
      setFeedback('Formazione confermata.')
      if (phase === 1) choosePhase(2)
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Impossibile confermare la formazione.') }
  }
  return <section className="rounded border border-white/10 bg-white/[0.04] p-4">
    <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Formazione</p>
    <div className="mt-3 grid grid-cols-2 gap-2">{([1, 2] as const).map(value => <button key={value} type="button" onClick={() => choosePhase(value)} className={`rounded px-3 py-3 font-black ${phase === value ? 'bg-[var(--event-primary)] text-black' : 'bg-white/10'}`}>Set {value}{findLineup(value) ? ' âœ“' : ''}</button>)}</div>
    <div className="mt-4 grid gap-2">{team.players.map(player => <button key={player.id} type="button" disabled={locked} onClick={() => toggle(player.id)} className={`flex min-h-14 items-center justify-between rounded border px-4 text-left font-bold ${selected.includes(player.id) ? 'border-[var(--event-primary)] bg-[var(--event-primary)]/15' : 'border-white/10 bg-black/30'}`}><span>{getPlayerDisplayName(player)}</span><span>{selected.includes(player.id) ? 'âœ“' : ''}</span></button>)}</div>
    {!validation.valid && selected.length === 2 ? <p className="mt-3 text-sm font-bold text-red-200">{validation.reason}</p> : null}
    {feedback || repository.error ? <p className="mt-3 rounded bg-white/10 p-3 text-sm font-bold">{feedback || repository.error}</p> : null}
    <button type="button" disabled={locked || repository.isSaving || !validation.valid} onClick={save} className="mt-4 w-full rounded bg-[var(--event-primary)] px-4 py-4 font-black text-black disabled:opacity-40">{persisted ? `Modifica formazione Set ${phase}` : `Conferma Set ${phase}`}</button>
    <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-black uppercase text-white/45">Eventuale Super Tie-Break</p><p className="mt-2 font-bold">{stb ? formatPair(stb.activePlayerIds, team) : 'Disponibile dopo la conferma dei primi due set.'}</p></div>
  </section>
}

function formatPair(pair: readonly [string, string], team: Tournament['teams'][number]) {
  return pair.map((playerId) => {
    const player = team.players.find((item) => item.id === playerId)
    return player ? getPlayerDisplayName(player) : 'Da definire'
  }).join(' + ')
}
