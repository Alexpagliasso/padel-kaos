import { useSyncExternalStore } from 'react'

let now = Date.now()
let timer: number | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) timer = window.setInterval(() => {
    now = Date.now()
    listeners.forEach(notify => notify())
  }, 1000)
  ;(timer as unknown as { unref?: () => void })?.unref?.()
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer !== undefined) { window.clearInterval(timer); timer = undefined }
  }
}

export function useSharedClock() {
  return useSyncExternalStore(subscribe, () => now, () => now)
}
