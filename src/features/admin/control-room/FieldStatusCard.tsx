import { getDiceRuleForMatch, getTeam } from '../../tournament/selectors'
import type { Match, Tournament } from '../../../shared/types/domain'

export function FieldStatusCard({ match, tournament }: { match: Match; tournament: Tournament }) {
  const teamA = getTeam(tournament, match.teamAId)
  const teamB = getTeam(tournament, match.teamBId)
  const court = tournament.courts.find((item) => item.id === match.courtId)
  const activeCard = tournament.teamCards.find((card) => card.state === 'active' && match.activeCardUsageIds.includes(card.id))
  const activeCardDefinition = tournament.cards.find((card) => card.id === activeCard?.cardId)
  const diceRule = getDiceRuleForMatch(tournament, match)

  return (
    <article className="rounded border border-white/10 bg-[#171717] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFD000]">{court?.name ?? 'Court TBD'}</p>
          <h2 className="mt-1 text-xl font-black">{teamA?.shortName ?? 'TBD'} vs {teamB?.shortName ?? 'TBD'}</h2>
        </div>
        <span className="rounded bg-white/10 px-2 py-1 text-xs font-black uppercase text-white/65">{match.status}</span>
      </div>

      <div className="grid gap-2">
        <ScoreLine name={teamA?.name ?? 'Team A'} games={match.score.games.A} />
        <ScoreLine name={teamB?.name ?? 'Team B'} games={match.score.games.B} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <StatusCell label="Set" value={String(match.score.currentSet)} />
        <StatusCell label="Remaining" value="Timer not available" />
        <StatusCell label="Active Card" value={activeCardDefinition?.name ?? 'None'} />
        <StatusCell label="Kaos State" value={diceRule?.title ?? 'None'} />
      </div>
    </article>
  )
}

function ScoreLine({ name, games }: { name: string; games: number }) {
  return (
    <div className="flex items-center justify-between rounded bg-black/45 px-3 py-2">
      <span className="font-black">{name}</span>
      <span className="text-2xl font-black text-[#FFD000]">{games}</span>
    </div>
  )
}

function StatusCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/[0.04] p-3">
      <p className="text-xs font-black uppercase text-white/40">{label}</p>
      <p className="mt-1 font-bold text-white/75">{value}</p>
    </div>
  )
}
