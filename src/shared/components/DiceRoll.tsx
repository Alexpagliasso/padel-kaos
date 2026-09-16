import { motion } from 'framer-motion'

export function DiceRoll({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-4">
      <motion.div
        animate={{ rotate: [0, 18, -12, 360], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 3 }}
        className="grid size-20 place-items-center rounded border-2 border-[var(--event-primary)] bg-white text-4xl font-black text-black"
      >
        {value}
      </motion.div>
      <div>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Kaos Time</p>
        <p className="text-2xl font-black">{label}</p>
      </div>
    </div>
  )
}
