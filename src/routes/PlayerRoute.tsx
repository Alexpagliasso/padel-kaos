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
import { getDiceRuleForMatch, getTeam } from '../features/tournament/selectors'
import { useDemoStore } from '../demo/demoStore'
import { useEventRepository } from '../repositories/eventRepository'

export function PlayerRoute() {
  const { data: tournament } = useTournament()
  const events = useEventRepository().events
  const selectedTeamId = useDemoStore((state) => state.selectedTeamId)
  const selectTeam = useDemoStore((state) => state.selectTeam)
  const playCard = useDemoStore((state) => state.playCard)
  const [feedback, setFeedback] = useState('')

  const playerTeam = getTeam(tournament, selectedTeamId) ?? tournament.teams[0]
  const player = playerTeam.players[0]
  const match = tournament.matches.find((item) => item.teamAId === playerTeam.id || item.teamBId === playerTeam.id) ?? tournament.matches[0]
  const teamA = getTeam(tournament, match.teamAId)
  const teamB = getTeam(tournament, match.teamBId)
  const cards = tournament.teamCards.filter((teamCard) => teamCard.teamId === playerTeam.id)
  const diceRule = getDiceRuleForMatch(tournament, match)
  const globalEvent = tournament.globalEvents.find((event) => event.status === 'active' || event.status === 'completed')
  const isKaosPending = match.status === 'kaos_pending' || match.status === 'kaos_reveal'

  return (
    <RoleShell>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-5">
        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">PLAYER DEMO</p>
            <h1 className="text-3xl font-black">Ciao {player.nickname}</h1>
            <p className="text-white/55">{playerTeam.name} · view as simulator</p>
          </div>
          <label className="grid gap-1 text-sm font-bold text-white/55">
            View as
            <select className="rounded border border-white/10 bg-black px-3 py-3 text-white" value={playerTeam.id} onChange={(event) => selectTeam(event.target.value)}>
              {tournament.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
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
                    disabled={teamCard.state !== 'available'}
                    onClick={() => {
                      const result = playCard(teamCard.id)
                      setFeedback(result.message)
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
