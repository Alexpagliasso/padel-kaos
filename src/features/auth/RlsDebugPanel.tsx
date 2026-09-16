import { ShieldCheck } from 'lucide-react'
import { useAuth } from './authContext'
import type { Tournament } from '../../shared/types/domain'

export function RlsDebugPanel({ tournament }: { tournament: Tournament }) {
  const { profile } = useAuth()
  if (!import.meta.env.DEV || !profile) return null

  const readableMatches = tournament.matches.filter((match) => {
    if (profile.role === 'admin' || profile.role === 'main_display') return true
    if (profile.role === 'referee') return false // Multi-court access is authoritative on the server.
    if (profile.role === 'court_display') return match.courtId === profile.courtId
    if (profile.role === 'team') return profile.teamId === match.teamAId || profile.teamId === match.teamBId
    return false
  })
  const ownVisibleCards = profile.teamId
    ? tournament.teamCards.filter((card) => card.teamId === profile.teamId).length
    : 0
  const opponentVisibleAvailableCards = profile.teamId
    ? tournament.teamCards.filter((card) => card.teamId !== profile.teamId && card.state === 'available').length
    : 0
  const canUpdateMatch = profile.role === 'admin' || profile.role === 'referee'

  return (
    <section className="rounded border border-[var(--event-primary)]/30 bg-[var(--event-primary)]/10 p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-5 text-[var(--event-primary)]" />
        <h2 className="text-lg font-black">RLS Debug</h2>
      </div>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        <DebugLine label="Ruolo attuale" value={profile.role} />
        <DebugLine label="Squadra" value={profile.teamId ?? 'nessuno'} />
        <DebugLine label={profile.role === 'referee' ? 'Campo primario legacy' : 'Campo'} value={profile.courtId ?? 'nessuno'} />
        <DebugLine label="Partite leggibili" value={profile.role === 'referee' ? 'verificate dal server per assegnazione' : String(readableMatches.length)} />
        <DebugLine label="Carte visibili della squadra" value={String(ownVisibleCards)} />
        <DebugLine label="Carte disponibili degli avversari visibili" value={String(opponentVisibleAvailableCards)} />
        <DebugLine label="Verifica modifica partita" value={canUpdateMatch ? 'test manuale richiesto' : 'rifiuto previsto'} />
      </div>
    </section>
  )
}

function DebugLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-black/40 px-3 py-2">
      <p className="text-xs font-black uppercase text-white/45">{label}</p>
      <p className="mt-1 break-all font-bold text-white/75">{value}</p>
    </div>
  )
}
