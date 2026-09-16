import { AnimatePresence, motion } from 'framer-motion'
import { Megaphone } from 'lucide-react'
import type { GlobalEvent } from '../types/domain'

export function GlobalEventOverlay({ event, fullscreen = false }: { event?: GlobalEvent; fullscreen?: boolean }) {
  return (
    <AnimatePresence>
      {event ? (
        <motion.div
          initial={{ opacity: 0, y: fullscreen ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={
            fullscreen
              ? 'fixed inset-0 z-50 grid place-items-center bg-[var(--event-primary)] p-6 text-black'
              : 'rounded border border-[var(--event-primary)]/40 bg-[var(--event-primary)]/10 p-4'
          }
        >
          <div className="max-w-4xl text-center">
            <Megaphone className="mx-auto mb-4 size-12" />
            <p className="text-sm font-black uppercase tracking-[0.22em]">{event.status}</p>
            <h2 className={fullscreen ? 'mt-3 text-6xl font-black' : 'mt-2 text-2xl font-black text-white'}>
              {event.title}
            </h2>
            <p className={fullscreen ? 'mt-4 text-2xl font-bold' : 'mt-2 text-sm text-white/65'}>
              {event.description}
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
