import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'

export function WinnerOverlay({ winner }: { winner?: string }) {
  if (!winner) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded border border-[var(--event-primary)] bg-[var(--event-primary)] p-6 text-center text-black"
    >
      <Trophy className="mx-auto mb-2 size-10" />
      <p className="text-sm font-black uppercase tracking-[0.2em]">Vincitore</p>
      <p className="text-3xl font-black">{winner}</p>
    </motion.div>
  )
}
