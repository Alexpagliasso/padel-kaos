import { Paper, Typography } from '@mui/material'
import { PageShell } from '../../../shared/components/Foundation'
import { Link } from 'react-router-dom'
import { CalendarPlus, KeyRound, Layers3, ShieldCheck, Trash2, Wrench } from 'lucide-react'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import type { Round } from '../../../shared/types/domain'
import { getCurrentRound } from './dashboardState'

export function AdminDashboard() {
  const { data: tournament, error, isLoading } = useAdminWorkspace()
  const currentRound = getCurrentRound(tournament)

  if (isLoading) return <AdminPageState title="Caricamento torneo" />
  if (error) return <AdminPageState title="Impossibile caricare il torneo" detail={error} tone="error" />

  return (
    <PageShell><div className="grid gap-4">
      <Paper component="section" sx={{ p: { xs: 3, md: 4 }, background: 'var(--event-gradient)' }}>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Panoramica Admin</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Typography variant="h1">{tournament.name}</Typography>
            <p className="mt-2 text-sm font-bold uppercase text-white/50">Status: {tournament.status ?? 'unknown'}</p>
          </div>
          <CurrentRoundBadge round={currentRound} />
        </div>
      </Paper>

      <Link to="/admin/control-room" className="flex min-h-20 items-center justify-between rounded border border-[var(--event-primary)]/50 bg-[var(--event-primary)] px-5 text-lg font-black uppercase text-black"><span>{currentRound?'GESTISCI TURNO':'VAI ALLA REGIA'}</span><ShieldCheck className="size-6" /></Link>
      <Paper sx={{p:2.5}}><p className="text-xs font-black uppercase tracking-[.16em] text-white/45">Situazione operativa</p><div className="mt-3 grid gap-2 text-sm font-bold sm:grid-cols-3"><span>{tournament.courts.length} campi</span><span>{tournament.teams.length} squadre</span><span>{tournament.matches.length} partite</span></div></Paper>
      <section className="grid gap-2 md:grid-cols-3">
        <ActionCard to="/admin/setup" label="Configurazione" icon={Wrench} />
        <ActionCard to="/admin/access" label="Gestione accessi" icon={KeyRound} />
        <ActionCard to="/admin/recovery" label="Backup" icon={CalendarPlus} />
        <ActionCard to="/admin/tournaments" label="Gestione tornei" icon={Trash2} />
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

function ActionCard({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Layers3 }) {
  return (
    <Link to={to} className="flex min-h-28 items-center justify-between rounded border border-white/10 bg-[#171717] p-4 font-black uppercase transition hover:border-[var(--event-primary)]/60 hover:bg-[var(--event-primary)]/10">
      <span>{label}</span>
      <Icon className="size-5 text-[var(--event-primary)]" />
    </Link>
  )
}
