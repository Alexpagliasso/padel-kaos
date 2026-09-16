import { Dice5 } from 'lucide-react'
import { getGlobalKaosStatus } from './controlRoomState'
import type { Match, Round, Tournament } from '../../../shared/types/domain'

export function GlobalKaosPanel({
  tournament,
  round,
  matches,
  onRollGlobalDice,
}: {
  tournament: Tournament
  round?: Round
  matches: Match[]
  onRollGlobalDice: (matchId: string) => void
}) {
  const status = getGlobalKaosStatus(round)
  const diceRule = round?.diceRuleId ? tournament.diceRules.find((rule) => rule.id === round.diceRuleId) : undefined
  const canRoll = Boolean(round && matches[0])

  return (
    <section className="rounded border border-white/10 bg-[#171717] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Global Kaos</p>
          <h2 className="text-2xl font-black">{status}</h2>
        </div>
        <Dice5 className="size-6 text-[var(--event-primary)]" />
      </div>

      <div className="grid gap-2 text-sm">
        <Info label="Risultato dado" value={round?.diceResult ? String(round.diceResult) : 'Non lanciato'} />
        <Info label="Regola Kaos" value={diceRule?.title ?? 'Non assegnata'} />
        <Info label="Inizio" value={round?.diceStartedAt ? new Date(round.diceStartedAt).toLocaleTimeString('it-IT') : 'Non disponibile'} />
        <Info label="Fine" value={round?.diceEndsAt ? new Date(round.diceEndsAt).toLocaleTimeString('it-IT') : 'Non disponibile'} />
      </div>

      <button
        type="button"
        className="mt-4 inline-flex w-full items-center justify-center rounded bg-[var(--event-primary)] px-4 py-3 font-black text-black disabled:opacity-50"
        disabled={!canRoll}
        onClick={() => {
          const match = matches[0]
          if (match) onRollGlobalDice(match.id)
        }}
      >
        LANCIA IL DADO GLOBALE
      </button>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded bg-black/45 px-3 py-2">
      <span className="font-black uppercase text-white/45">{label}</span>
      <span className="font-bold text-white/80">{value}</span>
    </div>
  )
}
