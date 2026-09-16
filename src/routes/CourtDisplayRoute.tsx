import { MatchTimer } from '../shared/components/MatchTimer'
import { DisplayShell } from '../shared/components/Foundation'
import { Scoreboard } from '../shared/components/Scoreboard'
import { LineupStrip } from '../shared/components/LineupStrip'
import { DiceRoll } from '../shared/components/DiceRoll'
import { GlobalEventOverlay } from '../shared/components/GlobalEventOverlay'
import { EventPresentationOverlay } from '../shared/components/EventPresentationOverlay'
import { useRoleTournament as useTournament } from '../features/admin/preview/useRoleTournament'
import { getCourt, getDiceRuleForMatch, getTeam } from '../features/tournament/selectors'
import { useEventRepository } from '../repositories/eventRepository'
import { useMatchRepository } from '../repositories/matchRepository'

export function CourtDisplayRoute() {
  const { data: tournament } = useTournament()
  const matchRepo = useMatchRepository()
  const events = useEventRepository().events

  const court = getCourt(tournament, matchRepo.selectedCourtId) ?? tournament.courts[0]
  const match = court ? tournament.matches.find((item) => item.courtId === court.id) ?? tournament.matches[0] : tournament.matches[0]
  if (!court || !match) {
    return (
      <DisplayShell>
        <main className="mx-auto grid min-h-[85svh] max-w-none content-center px-6 py-8">
          <section className="rounded border border-white/10 bg-[#171717] p-8 text-center">
            <p className="text-lg font-black uppercase tracking-[0.2em] text-[var(--event-primary)]">Schermo campo</p>
            <h1 className="mt-3 text-4xl font-black">Nessuna partita configurata</h1>
          </section>
        </main>
      </DisplayShell>
    )
  }
  const teamA = getTeam(tournament, match.teamAId)
  const teamB = getTeam(tournament, match.teamBId)
  const diceRule = getDiceRuleForMatch(tournament, match)
  const activeGlobal = tournament.globalEvents.find((event) => event.status === 'active' || event.status === 'completed')
  const activeCard = tournament.teamCards.find((teamCard) => teamCard.state === 'active' && match.activeCardUsageIds.includes(teamCard.id))
  const activeCardDefinition = tournament.cards.find((card) => card.id === activeCard?.cardId)
  const isKaosPending = match.status === 'kaos_pending' || match.status === 'kaos_reveal'

  return (
    <DisplayShell>
      <main className="mx-auto grid min-h-[85svh] max-w-none content-center gap-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-lg font-black uppercase tracking-[0.2em] text-[var(--event-primary)]">{tournament.name} / {court.name}</p>
            <h1 className="text-5xl font-black md:text-7xl">{teamA?.shortName} vs {teamB?.shortName}</h1>
          </div>

        </div>
        {isKaosPending ? (
          <section className="rounded border border-[var(--event-primary)] bg-[var(--event-primary)] p-10 text-center text-black">
            <p className="text-xl font-black uppercase tracking-[0.22em]">KAOS TIME</p>
            <h2 className="mt-3 text-7xl font-black">IN ATTESA DEL DADO</h2>
          </section>
        ) : (
          <EventPresentationOverlay events={events.filter((event) => !event.matchId || event.matchId === match.id)} />
        )}
        <Scoreboard match={match} teamA={teamA} teamB={teamB} display />
        <MatchTimer match={match} tournament={tournament} />
        <LineupStrip match={match} teamA={teamA} teamB={teamB} display />
        <div className="grid gap-4 md:grid-cols-3">
          {diceRule ? <DiceRoll value={diceRule.value} label={diceRule.title} /> : null}
          {activeCardDefinition ? (
            <div className="rounded border border-[var(--event-primary)]/30 bg-[var(--event-primary)]/10 p-4">
              <p className="text-sm font-black uppercase text-[var(--event-primary)]">Carta attiva</p>
              <p className="text-2xl font-black">{activeCardDefinition.name}</p>
            </div>
          ) : null}
          <GlobalEventOverlay event={activeGlobal} />
        </div>
      </main>
    </DisplayShell>
  )
}
