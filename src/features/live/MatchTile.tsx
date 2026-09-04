import type { Match, Tournament } from '../../shared/types/domain'
import { Scoreboard } from '../../shared/components/Scoreboard'
import { getCourt, getDiceRuleForMatch, getTeam } from '../tournament/selectors'

export function MatchTile({ match, tournament }: { match: Match; tournament: Tournament }) {
  const teamA = getTeam(tournament, match.teamAId)
  const teamB = getTeam(tournament, match.teamBId)
  const court = getCourt(tournament, match.courtId)
  const diceRule = getDiceRuleForMatch(tournament, match)

  return (
    <article className="rounded border border-white/10 bg-[#171717] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFD000]">{court?.name}</p>
          <h3 className="text-lg font-black">{teamA?.shortName} vs {teamB?.shortName}</h3>
        </div>
        <span className="rounded bg-white/10 px-2 py-1 text-xs font-black uppercase text-white/60">
          {match.status}
        </span>
      </div>
      <Scoreboard match={match} teamA={teamA} teamB={teamB} compact />
      {diceRule ? (
        <p className="mt-3 rounded bg-[#FFD000]/10 px-3 py-2 text-sm font-bold text-[#FFD000]">
          {diceRule.title}: {diceRule.description}
        </p>
      ) : null}
    </article>
  )
}
