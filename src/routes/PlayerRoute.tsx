import { useState } from 'react'
import { CreditCard, Radio, Swords, Table2 } from 'lucide-react'
import { RoleShell } from '../shared/components/RoleShell'
import { Scoreboard } from '../shared/components/Scoreboard'
import { LineupStrip } from '../shared/components/LineupStrip'
import { AnimatedCardReveal } from '../shared/components/AnimatedCardReveal'
import { GlobalEventOverlay } from '../shared/components/GlobalEventOverlay'
import { EventPresentationOverlay } from '../shared/components/EventPresentationOverlay'
import { MatchTile } from '../features/live/MatchTile'
import { useTournament } from '../features/tournament/useTournament'
import { getDiceRuleForMatch } from '../features/tournament/selectors'
import { getAvailablePairs, getRemainingPair, type PlayerPair } from '../domain/rules/rulesEngine'
import { useDemoStore } from '../demo/demoStore'
import { useEventRepository } from '../repositories/eventRepository'
import { dataProvider } from '../repositories'
import { useAuth } from '../features/auth/authContext'
import { resolvePlayerRouteState, type PlayerRouteState } from './playerRouteState'
import type { DemoEvent } from '../demo/demoTypes'
import type { Tournament } from '../shared/types/domain'
import { getPlayerDisplayName } from '../shared/lib/playerNames'

export function PlayerRoute() {
  const { data: tournament, isLoading, error } = useTournament()
  const events = useEventRepository().events
  const { profile } = useAuth()
  const selectedTeamId = useDemoStore((state) => state.selectedTeamId)
  const selectTeam = useDemoStore((state) => state.selectTeam)
  const playCard = useDemoStore((state) => state.playCard)

  const routeState = resolvePlayerRouteState({
    provider: dataProvider,
    tournament,
    isLoading,
    repositoryError: error,
    profile,
    demoSelectedTeamId: selectedTeamId,
  })

  if (routeState.type === 'loading') {
    return (
      <RoleShell>
        <main className="mx-auto grid min-h-[70svh] max-w-5xl place-items-center px-4 text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">Loading player area</p>
        </main>
      </RoleShell>
    )
  }

  if (routeState.type === 'error') {
    return (
      <RoleShell>
        <main className="mx-auto grid min-h-[70svh] max-w-5xl place-items-center px-4 text-center">
          <section className="max-w-xl rounded border border-white/10 bg-[#171717] p-6">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">Player area unavailable</p>
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
      onPlayDemoCard={(teamCardId) => playCard(teamCardId).message}
    />
  )
}

export function PlayerRouteContent({
  tournament,
  events,
  routeState,
  onSelectDemoTeam,
  onPlayDemoCard,
}: {
  tournament: Tournament
  events: DemoEvent[]
  routeState: Extract<PlayerRouteState, { type: 'ready' }>
  onSelectDemoTeam: (teamId: string) => void
  onPlayDemoCard: (teamCardId: string) => string
}) {
  const [feedback, setFeedback] = useState('')
  const { playerTeam, match, teamA, teamB, cards, greetingName, showDemoTeamSelector } = routeState
  const diceRule = getDiceRuleForMatch(tournament, match)
  const globalEvent = tournament.globalEvents.find((event) => event.status === 'active' || event.status === 'completed')
  const isKaosPending = match.status === 'kaos_pending' || match.status === 'kaos_reveal'

  return (
    <RoleShell>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-5">
        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">
              {showDemoTeamSelector ? 'PLAYER DEMO' : 'PLAYER AREA'}
            </p>
            <h1 className="text-3xl font-black">Ciao {greetingName}</h1>
            <p className="text-white/55">{playerTeam.name}{showDemoTeamSelector ? ' · view as simulator' : ''}</p>
          </div>
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
          <section className="mt-5 rounded border border-[#FFD000]/40 bg-[#FFD000]/10 p-6 text-center">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[#FFD000]">KAOS TIME</p>
            <h2 className="mt-2 text-4xl font-black">Waiting for dice roll</h2>
          </section>
        ) : null}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <section className="space-y-5">
            <Scoreboard match={match} teamA={teamA} teamB={teamB} />
            <LineupStrip match={match} teamA={teamA} teamB={teamB} />
            <PlayerLineupSummary team={playerTeam} match={match} />
            {diceRule ? (
              <div className="rounded border border-[#FFD000]/30 bg-[#FFD000]/10 p-4">
                <p className="text-sm font-black uppercase text-[#FFD000]">Kaos Rule</p>
                <p className="text-xl font-black">{diceRule.title}</p>
                <p className="text-sm text-white/65">{diceRule.description}</p>
              </div>
            ) : null}
            <GlobalEventOverlay event={globalEvent} />
          </section>
          <section className="space-y-4">
            <h2 className="text-xl font-black">Le tue carte</h2>
            {feedback ? <p className="rounded bg-[#FFD000]/10 p-3 font-bold text-[#FFD000]">{feedback}</p> : null}
            {cards.map((teamCard) => {
              const card = tournament.cards.find((item) => item.id === teamCard.cardId)
              return card ? (
                <div key={teamCard.id} className="space-y-3">
                  <AnimatedCardReveal card={card} teamCard={teamCard} />
                  <button
                    className="w-full rounded bg-[#FFD000] px-4 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-45"
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
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {tournament.matches.map((liveMatch) => (
            <MatchTile key={liveMatch.id} match={liveMatch} tournament={tournament} />
          ))}
        </section>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#0B0B0B]/95 px-2 py-2 backdrop-blur md:hidden">
        {[
          { label: 'Match', icon: Swords },
          { label: 'Cards', icon: CreditCard },
          { label: 'Group', icon: Table2 },
          { label: 'Live', icon: Radio },
        ].map((item) => (
          <button key={item.label} className="grid place-items-center gap-1 rounded py-2 text-xs font-bold text-white/70">
            <item.icon className="size-5 text-[#FFD000]" />
            {item.label}
          </button>
        ))}
      </nav>
    </RoleShell>
  )
}

function PlayerLineupSummary({ team, match }: { team: Tournament['teams'][number]; match: Tournament['matches'][number] }) {
  const currentSet = match.score.currentSet === 3 ? 3 : match.score.currentSet === 2 ? 2 : 1
  const previousLineups = match.lineups.filter((lineup) => lineup.teamId === team.id && lineup.setNumber < currentSet)
  const currentLineup = match.lineups.find((lineup) => lineup.teamId === team.id && lineup.setNumber === currentSet)
  const availablePairs = getAvailablePairs(team.players, previousLineups)
  const remainingPair = currentSet === 3 ? getRemainingPair(team.players, previousLineups) : undefined

  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">{getLineupPhaseLabel(currentSet)}</p>
      {currentSet === 1 ? (
        <div className="mt-3 space-y-3">
          <h2 className="text-xl font-black">Choose lineup</h2>
          <PairList title="Available" pairs={availablePairs} team={team} />
          {currentLineup ? <PairList title="Current" pairs={[currentLineup.activePlayerIds]} team={team} /> : null}
        </div>
      ) : null}
      {currentSet === 2 ? (
        <div className="mt-3 space-y-3">
          <PairList title="Used" pairs={previousLineups.map((lineup) => lineup.activePlayerIds)} team={team} />
          <PairList title="Available" pairs={availablePairs} team={team} />
          {currentLineup ? <PairList title="Current" pairs={[currentLineup.activePlayerIds]} team={team} /> : null}
        </div>
      ) : null}
      {currentSet === 3 ? (
        <div className="mt-3 space-y-3">
          <PairList title="Previous pairs" pairs={previousLineups.map((lineup) => lineup.activePlayerIds)} team={team} />
          {remainingPair ? (
            <>
              <PairList title="Required lineup" pairs={[remainingPair]} team={team} />
              <button type="button" disabled className="rounded bg-[#FFD000] px-4 py-3 font-black text-black opacity-50">
                Confirm required lineup
              </button>
            </>
          ) : (
            <p className="rounded border border-red-400/40 bg-red-950/20 p-3 text-sm font-bold text-red-100">
              No unique remaining pair is available.
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}

function PairList({ title, pairs, team }: { title: string; pairs: PlayerPair[]; team: Tournament['teams'][number] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase text-white/45">{title}</p>
      <div className="flex flex-wrap gap-2">
        {pairs.length > 0 ? pairs.map((pair) => (
          <span key={`${title}-${pair[0]}-${pair[1]}`} className="rounded bg-white/10 px-3 py-2 text-sm font-bold">
            {formatPair(pair, team)}
          </span>
        )) : (
          <span className="rounded border border-dashed border-white/20 px-3 py-2 text-sm text-white/50">None</span>
        )}
      </div>
    </div>
  )
}

function formatPair(pair: PlayerPair, team: Tournament['teams'][number]) {
  return pair.map((playerId) => {
    const player = team.players.find((item) => item.id === playerId)
    return player ? getPlayerDisplayName(player) : 'TBD'
  }).join(' + ')
}

function getLineupPhaseLabel(setNumber: 1 | 2 | 3) {
  if (setNumber === 1) return 'SET 1'
  if (setNumber === 2) return 'SET 2'
  return 'SUPER TIEBREAK'
}
