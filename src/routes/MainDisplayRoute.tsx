import { EventOverlay } from '../shared/components/Foundation'
import { DisplayShell } from '../shared/components/Foundation'
import { MatchTile } from '../features/live/MatchTile'
import { useRoleTournament as useTournament } from '../features/admin/preview/useRoleTournament'
import { getDiceRuleForMatch } from '../features/tournament/selectors'
import { getFeaturedGlobalEvent, getKaosMatch, getMainDisplayMode } from '../features/display/mainDisplayState'
import type { Tournament } from '../shared/types/domain'

export function MainDisplayRoute() {
  const { data: tournament, error, isLoading } = useTournament()

  if (isLoading) return <DisplayState title="PADEL KAOS LIVE" detail="Caricamento tabellone" />
  if (error) return <DisplayState title="PADEL KAOS LIVE" detail="Impossibile caricare lo schermo" />

  return <MainDisplayContent tournament={tournament} />
}

export function MainDisplayContent({ tournament }: { tournament: Tournament }) {
  const mode = getMainDisplayMode(tournament)
  const globalEvent = getFeaturedGlobalEvent(tournament)
  const kaosMatch = getKaosMatch(tournament)
  const diceRule = kaosMatch ? getDiceRuleForMatch(tournament, kaosMatch) : undefined
  const winnerPlayer = tournament.teams.flatMap((team) => team.players).find((player) => player.id === globalEvent?.winnerPlayerId)
  const winnerTeam = tournament.teams.find((team) => team.id === globalEvent?.winnerTeamId)

  return (
    <DisplayShell>
      <main className="min-h-[85svh] bg-[#080808] px-6 py-8 text-white">
        {mode === 'global_event_winner' ? (
          <FullscreenPanel kicker="VINCITORE POR TRES" title={winnerPlayer?.nickname ?? 'VINCITORE'} detail={`${winnerTeam?.name ?? 'Squadra da definire'} · ${globalEvent?.prize ?? 'Premio da definire'}`} />
        ) : null}

        {mode === 'global_event_start' ? (
          <FullscreenPanel kicker="SFIDA POR TRES" title="IL PRIMO POR TRES VINCE" detail={globalEvent?.prize ?? 'Premio da definire'} />
        ) : null}

        {mode === 'global_kaos' ? (
          <FullscreenPanel
            kicker="KAOS TIME"
            title={diceRule ? `RISULTATO DADO: ${diceRule.value}` : 'IN ATTESA DEL DADO'}
            detail={diceRule ? `${diceRule.title} · ${diceRule.description}` : 'Lancio globale in attesa'}
          />
        ) : null}

        {mode === 'live_board' ? (
          <section className="mx-auto grid max-w-none gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xl font-black uppercase tracking-[0.2em] text-[var(--event-primary)]">PADEL KAOS LIVE</p>
                <h1 className="mt-2 text-5xl font-black md:text-7xl">{tournament.name}</h1><p className="mt-3 text-xl font-bold">{tournament.rounds?.find(round => round.status !== 'completed')?.name ?? 'Evento in corso'}</p>
              </div>
              <p className="rounded bg-white/10 px-4 py-3 text-xl font-black">
                <span className="mr-2 inline-block size-3 rounded-full bg-[#38E078]" />
                {tournament.courts.length} CAMPI
              </p>
            </header>
            {tournament.matches.length === 0 ? (
              <p className="rounded border border-white/10 bg-[#171717] p-8 text-center text-2xl font-black text-white/60">Nessuna partita configurata</p>
            ) : (
              <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {tournament.matches.map((match) => (
                  <MatchTile key={match.id} match={match} tournament={tournament} display />
                ))}
              </section>
            )}
          </section>
        ) : null}
      </main>
    </DisplayShell>
  )
}

const FullscreenPanel = EventOverlay

function DisplayState({ title, detail }: { title: string; detail: string }) {
  return (
    <DisplayShell>
      <main className="grid min-h-[85svh] place-items-center bg-[#080808] p-6 text-center text-white">
        <div>
          <p className="text-xl font-black uppercase tracking-[0.2em] text-[var(--event-primary)]">{title}</p>
          <p className="mt-3 text-3xl font-black">{detail}</p>
        </div>
      </main>
    </DisplayShell>
  )
}
