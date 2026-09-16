import { Paper, Typography } from '@mui/material'
import { PageShell } from '../../../shared/components/Foundation'
import { Link } from 'react-router-dom'
import { CalendarPlus, KeyRound, Layers3, ShieldCheck, Trophy, Wrench } from 'lucide-react'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import type { Round } from '../../../shared/types/domain'
import { getCurrentRound } from './dashboardState'

export function AdminDashboard() {
  const { data: tournament, error, isLoading } = useAdminWorkspace()
  const currentRound = getCurrentRound(tournament)

  if (isLoading) return <AdminPageState title="Caricamento torneo" />
  if (error) return <AdminPageState title="Impossibile caricare il torneo" detail={error} tone="error" />

  return (
    <PageShell><div className="grid gap-6">
      <Paper component="section" sx={{ p: { xs: 3, md: 5 }, background: 'var(--event-gradient)' }}>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Panoramica Admin</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Typography variant="h1">{tournament.name}</Typography>
            <p className="mt-2 text-sm font-bold uppercase text-white/50">Status: {tournament.status ?? 'unknown'}</p>
          </div>
          <CurrentRoundBadge round={currentRound} />
        </div>
      </Paper>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Squadre" value={tournament.teams.length} icon={Layers3} />
        <Stat label="Gironi" value={tournament.groups.length} icon={Trophy} />
        <Stat label="Campi" value={tournament.courts.length} icon={ShieldCheck} />
        <Stat label="Partite" value={tournament.matches.length} icon={CalendarPlus} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard to="/admin/setup" label="Configurazione torneo" icon={Wrench} />
        <ActionCard to="/admin/control-room" label="Regia in diretta" icon={ShieldCheck} />
        <ActionCard to="/admin/access" label="Gestione accessi" icon={KeyRound} />
        <ActionCard to="/admin/recovery" label="Backup e ripristino" icon={CalendarPlus} />
      </section>
    </div></PageShell>
  )
}

export function AdminPageState({ title, detail, tone = 'default' }: { title: string; detail?: string; tone?: 'default' | 'error' }) {
  return (
    <PageShell><div>
      <section className={`rounded border p-5 ${tone === 'error' ? 'border-red-400/40 bg-red-950/20 text-red-100' : 'border-white/10 bg-[#171717] text-white'}`}>
        <p className="font-black">{title}</p>
        {detail ? <p className="mt-2 text-sm text-white/60">{detail}</p> : null}
      </section>
    </div></PageShell>
  )
}

function CurrentRoundBadge({ round }: { round?: Round }) {
  return (
    <div className="rounded border border-[var(--event-primary)]/40 bg-[var(--event-primary)]/10 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--event-primary)]">Turno attuale</p>
      <p className="mt-1 font-black">{round ? `${round.name} · ${round.status}` : 'Nessun turno configurato'}</p>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Layers3; label: string; value: number }) {
  return (
    <Paper component="article" sx={{ p: 3 }}>
      <Icon className="mb-3 size-5 text-[var(--event-primary)]" />
      <p className="text-3xl font-black">{value}</p>
      <p className="text-sm font-bold text-white/50">{label}</p>
    </Paper>
  )
}

function ActionCard({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Layers3 }) {
  return (
    <Link to={to} className="flex min-h-28 items-center justify-between rounded border border-white/10 bg-[#171717] p-4 font-black uppercase transition hover:border-[var(--event-primary)]/60 hover:bg-[var(--event-primary)]/10">
      <span>{label}</span>
      <Icon className="size-5 text-[var(--event-primary)]" />
    </Link>
  )
}
