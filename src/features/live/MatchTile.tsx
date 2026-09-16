import { Paper } from '@mui/material'
import type { Match, Tournament } from '../../shared/types/domain'
import { Scoreboard } from '../../shared/components/Scoreboard'
import { getCourt, getDiceRuleForMatch, getTeam } from '../tournament/selectors'

export function MatchTile({ match, tournament, display = false }: { match: Match; tournament: Tournament; display?: boolean }) {
  const teamA = getTeam(tournament, match.teamAId)
  const teamB = getTeam(tournament, match.teamBId)
  const court = getCourt(tournament, match.courtId)
  const diceRule = getDiceRuleForMatch(tournament, match)

  return (
    <Paper component="article" sx={{ p: { xs: 2, xl: 3 }, minWidth: 0 }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">{court?.name}</p>
          <h3 className="text-lg font-black">{teamA?.shortName} vs {teamB?.shortName}</h3>
        </div>
        <span className="rounded bg-white/10 px-2 py-1 text-xs font-black uppercase text-white/60">
          {match.status}
        </span>
      </div>
      <Scoreboard match={match} teamA={teamA} teamB={teamB} compact={!display} display={display} />
      {diceRule ? (
        <p className="mt-3 rounded bg-[var(--event-primary)]/10 px-3 py-2 text-sm font-bold text-[var(--event-primary)]">
          {diceRule.title}: {diceRule.description}
        </p>
      ) : null}
    </Paper>
  )
}
