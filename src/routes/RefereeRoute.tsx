import { useMemo, useState } from 'react'
import { Bolt, Dice5, RotateCcw, Trophy, Undo2 } from 'lucide-react'
import { RoleShell } from '../shared/components/RoleShell'
import { Scoreboard } from '../shared/components/Scoreboard'
import { LineupStrip } from '../shared/components/LineupStrip'
import { DiceRoll } from '../shared/components/DiceRoll'
import { GenderBonusBadge } from '../shared/components/GenderBonusBadge'
import { EventPresentationOverlay } from '../shared/components/EventPresentationOverlay'
import { useTournament } from '../features/tournament/useTournament'
import { getCurrentLineups, getDiceRuleForMatch, getPlayerName, getTeam } from '../features/tournament/selectors'
import { getMatchStartingScore } from '../demo/demoStore'
import { canScorePoint } from '../domain/rules/rulesEngine'
import { useEventRepository } from '../repositories/eventRepository'
import { useMatchRepository } from '../repositories/matchRepository'
import { useDemoStore } from '../demo/demoStore'

export function RefereeRoute() {
  const { data: tournament } = useTournament()
  const matchRepo = useMatchRepository()
  const eventRepo = useEventRepository()
  const acknowledgeCard = useDemoStore((state) => state.acknowledgeCard)
  const [porTresPlayerId, setPorTresPlayerId] = useState('')
  const [feedback, setFeedback] = useState('')

  const match = tournament.matches.find((item) => item.id === matchRepo.selectedMatchId) ?? tournament.matches[0]
  const teamA = getTeam(tournament, match.teamAId)
  const teamB = getTeam(tournament, match.teamBId)
  const diceRule = getDiceRuleForMatch(tournament, match)
  const pendingCards = tournament.teamCards.filter((teamCard) => {
    const isMatchCard = !teamCard.matchId || teamCard.matchId === match.id
    return teamCard.state === 'pending' && isMatchCard
  })
  const startingScore = useMemo(() => getMatchStartingScore(tournament, match), [match, tournament])
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
    <RoleShell>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">REFEREE DEMO</p>
            <h1 className="text-3xl font-black">{teamA?.shortName} vs {teamB?.shortName}</h1>
          </div>
          <label className="grid gap-1 text-sm font-bold text-white/55">
            Match to control
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
        {!scorePermission.allowed ? (
          <p className="rounded border border-[#FFD000]/40 bg-[#FFD000]/10 p-4 font-bold text-[#FFD000]">
            {scorePermission.reason}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <button disabled={!scorePermission.allowed} className="rounded bg-[#FFD000] px-5 py-6 text-xl font-black text-black disabled:opacity-40" onClick={() => matchRepo.scorePoint(match.id, 'A')}>+ Point {teamA?.shortName}</button>
          <button disabled={!scorePermission.allowed} className="rounded bg-[#00D1FF] px-5 py-6 text-xl font-black text-black disabled:opacity-40" onClick={() => matchRepo.scorePoint(match.id, 'B')}>+ Point {teamB?.shortName}</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Action icon={Undo2} label="Undo demo" disabled />
          <Action icon={Bolt} label={`Cards ${pendingCards.length}`} />
          <Action icon={Trophy} label="Por Tres" />
          <button className="inline-flex min-h-16 items-center justify-center gap-2 rounded border border-white/10 bg-[#171717] px-3 py-4 font-black" onClick={() => matchRepo.rollKaosDice(match.id)}>
            <Dice5 className="size-5 text-[#FFD000]" />
            Roll Dice
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button className="rounded bg-white/10 px-4 py-4 font-black" onClick={() => matchRepo.endSet(match.id)}>End Set</button>
          <button className="rounded bg-[#FFD000] px-4 py-4 font-black text-black" onClick={() => matchRepo.startSecondSet(match.id)}>Start Set 2</button>
          <button className="rounded border border-red-400/50 px-4 py-4 font-black text-red-200" onClick={() => {
            if (window.confirm('Terminare la partita?')) matchRepo.endMatch(match.id)
          }}>End Match</button>
        </div>

        {pendingCards.length ? (
          <section className="rounded border border-[#FFD000]/40 bg-[#FFD000]/10 p-5">
            <h2 className="mb-4 text-xl font-black">Pending Events</h2>
            <div className="grid gap-3">
              {pendingCards.map((teamCard) => {
                const team = getTeam(tournament, teamCard.teamId)
                const card = tournament.cards.find((item) => item.id === teamCard.cardId)
                return (
                  <article key={teamCard.id} className="rounded bg-black/40 p-4">
                    <p className="text-sm font-black uppercase text-[#FFD000]">{team?.name} played</p>
                    <h3 className="text-2xl font-black">{card?.name}</h3>
                    <p className="mb-3 text-white/65">{card?.description}</p>
                    <button className="rounded bg-[#FFD000] px-4 py-3 font-black text-black" onClick={() => setFeedback(acknowledgeCard(teamCard.id).message)}>Acknowledge</button>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        <LineupStrip match={match} teamA={teamA} teamB={teamB} />
        {diceRule ? (
          <section className="rounded border border-[#FFD000]/30 bg-[#FFD000]/10 p-5">
            <DiceRoll value={diceRule.value} label={diceRule.title} />
            <p className="mt-4 text-white/70">{diceRule.description}</p>
          </section>
        ) : null}

        <section className="rounded border border-white/10 bg-[#171717] p-5">
          <h2 className="mb-4 text-xl font-black">Special Events</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <select className="rounded bg-black px-3 py-3" value={selectedPorTresPlayer} onChange={(event) => setPorTresPlayerId(event.target.value)}>
              {activePlayers.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}
            </select>
            <button className="rounded bg-[#FFD000] px-4 py-3 font-black text-black" onClick={() => setFeedback(eventRepo.registerPorTres(match.id, selectedPorTresPlayer).message)}>
              Register Por Tres
            </button>
          </div>
          {feedback ? <p className="mt-3 rounded bg-white/10 p-3 font-bold">{feedback}</p> : null}
        </section>

        <section className="rounded border border-white/10 bg-[#171717] p-5">
          <h2 className="mb-4 text-xl font-black">Timeline audit</h2>
          <div className="space-y-3">
            {eventRepo.events.filter((event) => !event.matchId || event.matchId === match.id).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded bg-white/[0.04] p-3">
                <span className="font-bold">{event.type}</span>
                <span className="text-xs text-white/45">{new Date(event.createdAt).toLocaleTimeString('it-IT')}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </RoleShell>
  )
}

function Action({ icon: Icon, label, disabled = false }: { icon: typeof RotateCcw; label: string; disabled?: boolean }) {
  return (
    <button disabled={disabled} className="inline-flex min-h-16 items-center justify-center gap-2 rounded border border-white/10 bg-[#171717] px-3 py-4 font-black disabled:opacity-40">
      <Icon className="size-5 text-[#FFD000]" />
      {label}
    </button>
  )
}
