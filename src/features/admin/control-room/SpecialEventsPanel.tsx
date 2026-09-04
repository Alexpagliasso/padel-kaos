import { Trophy } from 'lucide-react'
import { getPorTresEvent } from './controlRoomState'
import type { Tournament } from '../../../shared/types/domain'

export function SpecialEventsPanel({
  tournament,
  prizeDraft,
  onPrizeChange,
  onActivatePorTres,
}: {
  tournament: Tournament
  prizeDraft: string
  onPrizeChange: (value: string) => void
  onActivatePorTres: (prize: string) => void
}) {
  const porTres = getPorTresEvent(tournament)
  const winnerPlayer = tournament.teams.flatMap((team) => team.players).find((player) => player.id === porTres?.winnerPlayerId)
  const winnerTeam = tournament.teams.find((team) => team.id === porTres?.winnerTeamId)
  const canActivate = !porTres || porTres.status === 'draft' || porTres.status === 'cancelled'

  return (
    <section className="rounded border border-white/10 bg-[#171717] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Trophy className="size-5 text-[#FFD000]" />
        <h2 className="text-xl font-black">Special Events</h2>
      </div>

      <div className="rounded bg-black/45 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFD000]">POR TRES</p>
            <p className="mt-1 font-black uppercase">Status: {porTres?.status ?? 'inactive'}</p>
          </div>
          <span className="rounded bg-white/10 px-2 py-1 text-xs font-black uppercase text-white/60">
            {porTres?.prize ?? (prizeDraft || 'No prize')}
          </span>
        </div>
        {winnerPlayer || winnerTeam ? (
          <p className="mt-3 text-sm font-bold text-white/70">
            Winner: {winnerPlayer?.nickname ?? 'Player TBD'} · {winnerTeam?.name ?? 'Team TBD'}
          </p>
        ) : null}
        <input
          className="mt-4 w-full rounded border border-white/10 bg-black px-3 py-3 font-bold"
          value={prizeDraft}
          onChange={(event) => onPrizeChange(event.target.value)}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded bg-[#FFD000] px-3 py-3 font-black text-black disabled:opacity-50"
            disabled={!canActivate}
            onClick={() => onActivatePorTres(prizeDraft)}
          >
            ACTIVATE
          </button>
          <button type="button" className="rounded bg-white/10 px-3 py-3 font-black text-white/45" disabled>
            END / COMPLETE
          </button>
        </div>
      </div>
    </section>
  )
}
