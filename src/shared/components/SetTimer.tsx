import type { Match } from '../types/domain'
import { getSetTimer } from '../../domain/live/setTimer'
import { formatCountdown } from '../../domain/live/readiness'
import { useSharedClock } from '../hooks/useSharedClock'

export function SetTimer({ match, size = 'large' }: { match: Match; size?: 'compact' | 'large' | 'display' }) {
  const timer = getSetTimer(match, useSharedClock())
  if (!timer) return null
  const urgent = timer.phase !== 'NORMAL'
  return <section aria-label={`Timer Set ${timer.setNumber}`} className={`rounded-xl border text-center ${urgent ? 'border-red-400/60 bg-red-500/15 text-red-100 motion-safe:animate-pulse' : 'border-[var(--event-primary)]/45 bg-[var(--event-primary)]/10'} ${size === 'compact' ? 'px-3 py-2' : 'px-4 py-3'}`}>
    <p className="text-xs font-black uppercase tracking-[.18em]">Set {timer.setNumber}</p>
    <p className={`${size === 'display' ? 'text-[clamp(2rem,5vw,5rem)]' : size === 'large' ? 'text-6xl' : 'text-3xl'} font-black leading-none tabular-nums`}>{formatCountdown(timer.remainingSeconds)}</p>
    {timer.phase === 'FINAL_MINUTE' && <p className="mt-1 font-black uppercase tracking-wide">ULTIMO MINUTO</p>}
    {timer.phase === 'ULTIMO_GAME' && <p className="mt-1 font-black uppercase tracking-wide">ULTIMO GAME</p>}
  </section>
}
