import { Link } from 'react-router-dom'
import { CalendarPlus, KeyRound, Layers3, ShieldCheck, Trophy, Wrench } from 'lucide-react'
import { useTournament } from '../../tournament/useTournament'
import type { Round } from '../../../shared/types/domain'
import { getCurrentRound } from './dashboardState'

export function AdminDashboard() {
  const { data: tournament, error, isLoading } = useTournament()
  const currentRound = getCurrentRound(tournament)

  if (isLoading) return <AdminPageState title="Loading tournament" />
  if (error) return <AdminPageState title="Unable to load tournament" detail={error} tone="error" />

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6">
      <section className="rounded border border-white/10 bg-[#171717] p-5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">Admin Dashboard</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black md:text-5xl">{tournament.name}</h1>
            <p className="mt-2 text-sm font-bold uppercase text-white/50">Status: {tournament.status ?? 'unknown'}</p>
          </div>
          <CurrentRoundBadge round={currentRound} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Squadre" value={tournament.teams.length} icon={Layers3} />
        <Stat label="Gironi" value={tournament.groups.length} icon={Trophy} />
        <Stat label="Campi" value={tournament.courts.length} icon={ShieldCheck} />
        <Stat label="Match" value={tournament.matches.length} icon={CalendarPlus} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard to="/admin/setup" label="Tournament Setup" icon={Wrench} />
        <ActionCard to="/admin/control-room" label="Live Control Room" icon={ShieldCheck} />
        <ActionCard to="/admin/access" label="Access Management" icon={KeyRound} />
        <ActionCard to="/admin/recovery" label="Backup & Recovery" icon={CalendarPlus} />
      </section>
    </main>
  )
}

export function AdminPageState({ title, detail, tone = 'default' }: { title: string; detail?: string; tone?: 'default' | 'error' }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <section className={`rounded border p-5 ${tone === 'error' ? 'border-red-400/40 bg-red-950/20 text-red-100' : 'border-white/10 bg-[#171717] text-white'}`}>
        <p className="font-black">{title}</p>
        {detail ? <p className="mt-2 text-sm text-white/60">{detail}</p> : null}
      </section>
    </main>
  )
}

function CurrentRoundBadge({ round }: { round?: Round }) {
  return (
    <div className="rounded border border-[#FFD000]/40 bg-[#FFD000]/10 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FFD000]">Round corrente</p>
      <p className="mt-1 font-black">{round ? `${round.name} · ${round.status}` : 'No round configured'}</p>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Layers3; label: string; value: number }) {
  return (
    <article className="rounded border border-white/10 bg-[#171717] p-4">
      <Icon className="mb-3 size-5 text-[#FFD000]" />
      <p className="text-3xl font-black">{value}</p>
      <p className="text-sm font-bold text-white/50">{label}</p>
    </article>
  )
}

function ActionCard({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Layers3 }) {
  return (
    <Link to={to} className="flex min-h-28 items-center justify-between rounded border border-white/10 bg-[#171717] p-4 font-black uppercase transition hover:border-[#FFD000]/60 hover:bg-[#FFD000]/10">
      <span>{label}</span>
      <Icon className="size-5 text-[#FFD000]" />
    </Link>
  )
}
