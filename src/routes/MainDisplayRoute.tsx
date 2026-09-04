import { motion } from 'framer-motion'
import { RoleShell } from '../shared/components/RoleShell'
import { MatchTile } from '../features/live/MatchTile'
import { useTournament } from '../features/tournament/useTournament'
import { getDiceRuleForMatch } from '../features/tournament/selectors'
import { getFeaturedGlobalEvent, getKaosMatch, getMainDisplayMode } from '../features/display/mainDisplayState'
import type { Tournament } from '../shared/types/domain'

export function MainDisplayRoute() {
  const { data: tournament, error, isLoading } = useTournament()

  if (isLoading) return <DisplayState title="PADEL KAOS LIVE" detail="Loading board" />
  if (error) return <DisplayState title="PADEL KAOS LIVE" detail="Unable to load display" />

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
    <RoleShell>
      <main className="min-h-[calc(100svh-66px)] bg-[#080808] px-6 py-8 text-white">
        {mode === 'global_event_winner' ? (
          <FullscreenPanel kicker="POR TRES WINNER" title={winnerPlayer?.nickname ?? 'WINNER'} detail={`${winnerTeam?.name ?? 'Team TBD'} · ${globalEvent?.prize ?? 'Prize TBD'}`} />
        ) : null}

        {mode === 'global_event_start' ? (
          <FullscreenPanel kicker="POR TRES CHALLENGE" title="FIRST POR TRES WINS" detail={globalEvent?.prize ?? 'Prize TBD'} />
        ) : null}

        {mode === 'global_kaos' ? (
          <FullscreenPanel
            kicker="KAOS TIME"
            title={diceRule ? `DICE RESULT: ${diceRule.value}` : 'WAITING FOR DICE'}
            detail={diceRule ? `${diceRule.title} · ${diceRule.description}` : 'Global dice pending'}
          />
        ) : null}

        {mode === 'live_board' ? (
          <section className="mx-auto grid max-w-7xl gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xl font-black uppercase tracking-[0.2em] text-[#FFD000]">PADEL KAOS LIVE</p>
                <h1 className="mt-2 text-5xl font-black md:text-7xl">{tournament.name}</h1>
              </div>
              <p className="rounded bg-white/10 px-4 py-3 text-xl font-black">
                <span className="mr-2 inline-block size-3 rounded-full bg-[#38E078]" />
                {tournament.matches.length} COURTS
              </p>
            </header>
            {tournament.matches.length === 0 ? (
              <p className="rounded border border-white/10 bg-[#171717] p-8 text-center text-2xl font-black text-white/60">No matches configured</p>
            ) : (
              <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {tournament.matches.map((match) => (
                  <MatchTile key={match.id} match={match} tournament={tournament} />
                ))}
              </section>
            )}
          </section>
        ) : null}
      </main>
    </RoleShell>
  )
}

function FullscreenPanel({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="grid min-h-[calc(100svh-130px)] place-items-center text-center"
    >
      <div>
        <p className="text-2xl font-black uppercase tracking-[0.24em] text-[#FFD000]">{kicker}</p>
        <h1 className="mt-5 text-6xl font-black md:text-8xl">{title}</h1>
        <p className="mt-5 text-2xl font-bold text-white/70 md:text-4xl">{detail}</p>
      </div>
    </motion.section>
  )
}

function DisplayState({ title, detail }: { title: string; detail: string }) {
  return (
    <RoleShell>
      <main className="grid min-h-[calc(100svh-66px)] place-items-center bg-[#080808] p-6 text-center text-white">
        <div>
          <p className="text-xl font-black uppercase tracking-[0.2em] text-[#FFD000]">{title}</p>
          <p className="mt-3 text-3xl font-black">{detail}</p>
        </div>
      </main>
    </RoleShell>
  )
}
