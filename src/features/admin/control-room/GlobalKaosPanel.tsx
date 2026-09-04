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
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFD000]">Global Kaos</p>
          <h2 className="text-2xl font-black">{status}</h2>
        </div>
        <Dice5 className="size-6 text-[#FFD000]" />
      </div>

      <div className="grid gap-2 text-sm">
        <Info label="Dice Result" value={round?.diceResult ? String(round.diceResult) : 'Not rolled'} />
        <Info label="Kaos Rule" value={diceRule?.title ?? 'Not assigned'} />
        <Info label="Started" value={round?.diceStartedAt ? new Date(round.diceStartedAt).toLocaleTimeString('it-IT') : 'Not available'} />
        <Info label="Ends" value={round?.diceEndsAt ? new Date(round.diceEndsAt).toLocaleTimeString('it-IT') : 'Not available'} />
      </div>

      <button
        type="button"
        className="mt-4 inline-flex w-full items-center justify-center rounded bg-[#FFD000] px-4 py-3 font-black text-black disabled:opacity-50"
        disabled={!canRoll}
        onClick={() => {
          const match = matches[0]
          if (match) onRollGlobalDice(match.id)
        }}
      >
        ROLL GLOBAL DICE
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
