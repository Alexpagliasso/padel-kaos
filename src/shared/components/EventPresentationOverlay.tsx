import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bolt, Crown, Dice5, Megaphone, Trophy } from 'lucide-react'
import type { DemoEvent } from '../../demo/demoTypes'

const priority = ['GLOBAL_EVENT_WON', 'GLOBAL_EVENT_STARTED', 'DICE_ROLLED', 'CARD_PLAYED'] as const

export function EventPresentationOverlay({
  events,
  fullscreen = false,
  autoHideMs = fullscreen ? 6_000 : 5_000,
}: {
  events: DemoEvent[]
  fullscreen?: boolean
  autoHideMs?: number
}) {
  const event = events.find((item) => priority.includes(item.type as (typeof priority)[number]))
  const [hiddenEventId, setHiddenEventId] = useState<string | undefined>()

  useEffect(() => {
    if (!event) return undefined
    const timeout = window.setTimeout(() => setHiddenEventId(event.id), autoHideMs)
    return () => window.clearTimeout(timeout)
  }, [autoHideMs, event])

  if (!event) return null
  if (hiddenEventId === event.id) return null

  const presentation = getPresentation(event)
  const Icon = presentation.icon

  return (
    <AnimatePresence>
      <motion.div
        key={event.id}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className={
          fullscreen
            ? 'fixed inset-0 z-50 grid place-items-center bg-[#FFD000] p-6 text-center text-black'
            : 'rounded border border-[#FFD000]/40 bg-[#FFD000]/10 p-5 text-white'
        }
      >
        <div className="max-w-4xl text-center">
          <Icon className="mx-auto mb-4 size-14" />
          <p className="text-sm font-black uppercase tracking-[0.22em]">{presentation.kicker}</p>
          <h2 className={fullscreen ? 'mt-3 text-6xl font-black' : 'mt-2 text-3xl font-black'}>
            {presentation.title}
          </h2>
          <p className={fullscreen ? 'mt-4 text-2xl font-bold' : 'mt-2 text-lg font-bold text-white/70'}>
            {presentation.body}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function getPresentation(event: DemoEvent) {
  if (event.type === 'GLOBAL_EVENT_WON') {
    return {
      icon: Trophy,
      kicker: 'Por Tres winner',
      title: String(event.payload.playerName ?? 'Winner'),
      body: `${String(event.payload.teamName ?? '')} wins ${String(event.payload.prize ?? 'the prize')}`,
    }
  }
  if (event.type === 'GLOBAL_EVENT_STARTED') {
    return {
      icon: Megaphone,
      kicker: 'Por Tres challenge',
      title: 'First Por Tres wins',
      body: String(event.payload.prize ?? 'Prize active'),
    }
  }
  if (event.type === 'DICE_ROLLED') {
    return {
      icon: Dice5,
      kicker: 'Kaos time',
      title: `${String(event.payload.value ?? '')} ${String(event.payload.title ?? '')}`,
      body: 'Dice result stored once in the shared demo state',
    }
  }
  if (event.type === 'CARD_PLAYED') {
    return {
      icon: Bolt,
      kicker: 'Card played',
      title: String(event.payload.cardName ?? 'Special card'),
      body: String(event.payload.teamName ?? 'Team'),
    }
  }
  return {
    icon: Crown,
    kicker: event.type,
    title: 'Live event',
    body: '',
  }
}
