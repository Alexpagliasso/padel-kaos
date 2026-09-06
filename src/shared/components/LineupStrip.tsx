import { UsersRound } from 'lucide-react'
import type { Match, Team } from '../types/domain'
import { getPlayerName } from '../../features/tournament/selectors'

export function LineupStrip({ match, teamA, teamB }: { match: Match; teamA?: Team; teamB?: Team }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[teamA, teamB].map((team) => {
        const teamLineups = match.lineups
          .filter((lineup) => lineup.teamId === team?.id)
          .sort((first, second) => first.setNumber - second.setNumber)
        return (
          <div key={team?.id} className="rounded border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-white/70">
              <UsersRound className="size-4 text-[#FFD000]" />
              {team?.shortName ?? 'Team'}
            </div>
            {teamLineups.length > 0 ? (
              <div className="grid gap-3">
                {teamLineups.map((lineup) => (
                  <div key={`${lineup.teamId}-${lineup.setNumber}`} className="rounded bg-black/25 p-3">
                    <p className="mb-2 text-xs font-black uppercase text-white/40">
                      {getLineupPhaseLabel(lineup.setNumber)}
                      {lineup.setNumber === match.score.currentSet ? ' · Current' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {lineup.activePlayerIds.map((playerId) => (
                        <span key={playerId} className="rounded bg-white/10 px-3 py-2 text-sm font-bold">
                          {getPlayerName(team, playerId)}
                        </span>
                      ))}
                      <span className="rounded border border-dashed border-white/20 px-3 py-2 text-sm text-white/50">
                        Bench: {getPlayerName(team, lineup.benchPlayerId)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="rounded border border-dashed border-white/20 px-3 py-2 text-sm text-white/50">
                Lineup TBD
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function getLineupPhaseLabel(setNumber: number) {
  if (setNumber === 1) return 'Set 1'
  if (setNumber === 2) return 'Set 2'
  if (setNumber === 3) return 'Super Tie-break'
  return `Set ${setNumber}`
}
