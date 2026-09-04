import { RadioTower } from 'lucide-react'
import { useTournament } from '../../tournament/useTournament'
import { useEventRepository } from '../../../repositories/eventRepository'
import { useMatchRepository } from '../../../repositories/matchRepository'
import type { Tournament } from '../../../shared/types/domain'
import { AdminPageState } from '../dashboard/AdminDashboard'
import { EventManagementPanel } from './EventManagementPanel'
import { FieldStatusCard } from './FieldStatusCard'
import { GlobalKaosPanel } from './GlobalKaosPanel'
import { SpecialEventsPanel } from './SpecialEventsPanel'
import { getControlRoomRound, getCurrentRoundMatches } from './controlRoomState'

export function ControlRoom() {
  const { data: tournament, error, isLoading } = useTournament()
  const matchRepo = useMatchRepository()
  const eventRepo = useEventRepository()

  if (isLoading) return <AdminPageState title="Loading control room" />
  if (error) return <AdminPageState title="Unable to load control room" detail={error} tone="error" />

  return (
    <ControlRoomContent
      tournament={tournament}
      porTresPrizeDraft={eventRepo.porTresPrizeDraft}
      onPorTresPrizeChange={eventRepo.setPorTresPrizeDraft}
      onActivatePorTres={eventRepo.activatePorTres}
      onRollGlobalDice={matchRepo.rollKaosDice}
    />
  )
}

export function ControlRoomContent({
  tournament,
  porTresPrizeDraft,
  onPorTresPrizeChange,
  onActivatePorTres,
  onRollGlobalDice,
}: {
  tournament: Tournament
  porTresPrizeDraft: string
  onPorTresPrizeChange: (value: string) => void
  onActivatePorTres: (prize: string) => void
  onRollGlobalDice: (matchId: string) => void
}) {
  const currentRound = getControlRoomRound(tournament)
  const matches = getCurrentRoundMatches(tournament, currentRound)
  const isLive = tournament.status === 'live' || matches.some((match) => match.status !== 'scheduled' && match.status !== 'ready' && match.status !== 'completed')

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-5">
        <header className="rounded border border-white/10 bg-[#171717] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">PADEL KAOS</p>
              <h1 className="mt-2 text-3xl font-black md:text-5xl">{tournament.name}</h1>
              <p className="mt-2 text-sm font-bold uppercase text-white/50">
                {currentRound ? currentRound.name : 'No round configured'} · {tournament.status ?? 'unknown'}
              </p>
            </div>
            {isLive ? (
              <p className="rounded bg-[#38E078]/15 px-3 py-2 font-black text-[#38E078]">
                <span className="mr-2 inline-block size-2 rounded-full bg-[#38E078]" />
                LIVE
              </p>
            ) : null}
          </div>
        </header>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <RadioTower className="size-5 text-[#FFD000]" />
            <h2 className="text-xl font-black">Field Status</h2>
          </div>
          {matches.length === 0 ? (
            <p className="rounded border border-white/10 bg-[#171717] p-5 text-sm font-bold text-white/60">No matches configured</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {matches.map((match) => <FieldStatusCard key={match.id} match={match} tournament={tournament} />)}
            </div>
          )}
        </section>
      </section>

      <aside className="space-y-5">
        <GlobalKaosPanel
          tournament={tournament}
          round={currentRound}
          matches={matches}
          onRollGlobalDice={onRollGlobalDice}
        />
        <SpecialEventsPanel
          tournament={tournament}
          prizeDraft={porTresPrizeDraft}
          onPrizeChange={onPorTresPrizeChange}
          onActivatePorTres={onActivatePorTres}
        />
        <EventManagementPanel />
      </aside>
    </main>
  )
}
