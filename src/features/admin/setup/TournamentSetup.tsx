import { useState } from 'react'
import { CalendarPlus, CreditCard, Layers3, MapPinned, Network, Trophy } from 'lucide-react'
import { useTournament } from '../../tournament/useTournament'
import { dataProvider } from '../../../repositories'
import { AdminPageState } from '../dashboard/AdminDashboard'
import type { Tournament } from '../../../shared/types/domain'

const tabs = ['TOURNAMENT', 'TEAMS', 'GROUPS', 'COURTS', 'ROUNDS / MATCHES', 'CARDS'] as const
type SetupTab = (typeof tabs)[number]

export function TournamentSetup() {
  const { data: tournament, error, isLoading } = useTournament()

  if (isLoading) return <AdminPageState title="Loading setup" />
  if (error) return <AdminPageState title="Unable to load setup" detail={error} tone="error" />

  return <TournamentSetupContent tournament={tournament} />
}

export function TournamentSetupContent({ tournament }: { tournament: Tournament }) {
  const [tab, setTab] = useState<SetupTab>('TOURNAMENT')

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">Tournament Setup</p>
        <h1 className="mt-2 text-3xl font-black">{tournament.name}</h1>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-white/10 pb-3">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            className={`shrink-0 rounded px-3 py-2 text-sm font-black ${tab === item ? 'bg-[#FFD000] text-black' : 'bg-white/10 text-white/70'}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {tab === 'TOURNAMENT' ? (
        <SetupPanel icon={Trophy} title="Tournament">
          <InfoGrid rows={[
            ['Name', tournament.name],
            ['Status', tournament.status ?? 'unknown'],
            ['Phase', tournament.phase ?? 'GROUP_STAGE'],
            ['Provider', dataProvider],
          ]} />
        </SetupPanel>
      ) : null}

      {tab === 'TEAMS' ? (
        <SetupPanel icon={Layers3} title="Teams">
          {tournament.teams.length === 0 ? <EmptySetupState label="No teams configured" /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {tournament.teams.map((team) => (
                <article key={team.id} className="rounded border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-black">{team.name}</h2>
                    <span className="rounded px-2 py-1 text-xs font-black text-black" style={{ background: team.color }}>{team.shortName}</span>
                  </div>
                  <p className="mt-3 text-sm text-white/60">
                    {team.players.map((player) => `${player.nickname} ${player.gender === 'woman' ? 'F' : 'M'}`).join(' · ') || 'No players configured'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </SetupPanel>
      ) : null}

      {tab === 'GROUPS' ? (
        <SetupPanel icon={Network} title="Groups">
          <SimpleList items={tournament.groups.map((group) => group.name)} emptyLabel="No groups configured" />
        </SetupPanel>
      ) : null}

      {tab === 'COURTS' ? (
        <SetupPanel icon={MapPinned} title="Courts">
          <SimpleList items={tournament.courts.map((court) => court.name)} emptyLabel="No courts configured" />
        </SetupPanel>
      ) : null}

      {tab === 'ROUNDS / MATCHES' ? (
        <SetupPanel icon={CalendarPlus} title="Rounds / Matches">
          <div className="grid gap-4 lg:grid-cols-2">
            <SimpleList items={(tournament.rounds ?? []).map((round) => `${round.name} · ${round.status}`)} emptyLabel="No rounds configured" />
            <SimpleList items={tournament.matches.map((match) => {
              const teamA = tournament.teams.find((team) => team.id === match.teamAId)
              const teamB = tournament.teams.find((team) => team.id === match.teamBId)
              return `${teamA?.name ?? 'TBD'} vs ${teamB?.name ?? 'TBD'} · ${match.status}`
            })} emptyLabel="No matches configured" />
          </div>
        </SetupPanel>
      ) : null}

      {tab === 'CARDS' ? (
        <SetupPanel icon={CreditCard} title="Cards">
          <SimpleList items={tournament.cards.map((card) => `${card.name} · ${card.durationType}`)} emptyLabel="No cards configured" />
        </SetupPanel>
      ) : null}
    </main>
  )
}

function SetupPanel({ icon: Icon, title, children }: { icon: typeof Layers3; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-white/10 bg-[#171717] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-5 text-[#FFD000]" />
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded bg-black/50 p-3">
          <p className="text-xs font-black uppercase text-white/45">{label}</p>
          <p className="mt-1 font-bold">{value}</p>
        </div>
      ))}
    </div>
  )
}

function SimpleList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) return <EmptySetupState label={emptyLabel} />
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <p key={item} className="rounded bg-black/50 px-3 py-2 font-bold text-white/75">{item}</p>
      ))}
    </div>
  )
}

function EmptySetupState({ label }: { label: string }) {
  return <p className="rounded border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/55">{label}</p>
}
