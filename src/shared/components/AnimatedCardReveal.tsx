import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import type { CardDefinition, TeamCard } from '../types/domain'

export function AnimatedCardReveal({
  card,
  teamCard,
}: {
  card: CardDefinition
  teamCard: TeamCard
}) {
  return (
    <motion.article
      initial={{ rotateY: -16, y: 12, opacity: 0 }}
      animate={{ rotateY: 0, y: 0, opacity: 1 }}
      whileHover={{ y: -4 }}
      className="rounded border border-[#FFD000]/30 bg-[#171717] p-4 shadow-[0_0_30px_rgba(255,208,0,0.08)]"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded bg-[#FFD000] text-black">
          <Zap className="size-5" />
        </span>
        <span className="rounded bg-white/10 px-2 py-1 text-xs font-black uppercase text-white/70">
          {teamCard.state}
        </span>
      </div>
      <h3 className="text-xl font-black">{card.name}</h3>
      <p className="mt-2 text-sm leading-6 text-white/60">{card.description}</p>
    </motion.article>
  )
}
