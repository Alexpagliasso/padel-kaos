import { UsersRound } from 'lucide-react'
import type { Match, Team } from '../types/domain'
import { getCurrentLineups, getPlayerName } from '../../features/tournament/selectors'

export function LineupStrip({ match, teamA, teamB }: { match: Match; teamA?: Team; teamB?: Team }) {
  const lineups = getCurrentLineups(match)
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[teamA, teamB].map((team) => {
        const lineup = lineups.find((item) => item.teamId === team?.id)
        return (
          <div key={team?.id} className="rounded border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-white/70">
              <UsersRound className="size-4 text-[#FFD000]" />
              {team?.shortName ?? 'Team'}
            </div>
            <div className="flex flex-wrap gap-2">
              {lineup?.activePlayerIds.map((playerId) => (
                <span key={playerId} className="rounded bg-white/10 px-3 py-2 text-sm font-bold">
                  {getPlayerName(team, playerId)}
                </span>
              ))}
              <span className="rounded border border-dashed border-white/20 px-3 py-2 text-sm text-white/50">
                Bench: {lineup ? getPlayerName(team, lineup.benchPlayerId) : 'TBD'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
