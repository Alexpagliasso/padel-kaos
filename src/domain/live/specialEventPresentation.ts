import type { GlobalEvent, Tournament } from '../../shared/types/domain'
import type { DiceAudience } from './dicePresentation'

export const SPECIAL_EVENT_REVEAL_MS = 14000
export const SPECIAL_EVENT_CONTINUE_MS = 5000
export const SPECIAL_EVENT_DISMISSED_EVENT = 'padel-kaos:special-event-dismissed'

export const specialEventArtwork: Readonly<Record<string, { title: string; artwork: string; description?: string }>> = {
  por_tres: { title: 'POR TRES', artwork: '/events/por-tres-placeholder.svg', description: 'Punto vincente realizzato da fuori campo.' },
}
export const defaultSpecialEventArtwork = { title: 'EVENTO SPECIALE', artwork: '/events/special-event-placeholder.svg' }

export function eventArtwork(event: GlobalEvent) {
  return (event.code ? specialEventArtwork[event.code] : undefined)?.artwork ?? defaultSpecialEventArtwork.artwork
}

export function openSpecialEventReveal(tournament: Tournament, audience: DiceAudience, now: number) {
  const event = [...tournament.globalEvents].filter(item => item.startedAt && item.status !== 'draft' && item.status !== 'cancelled')
    .sort((a,b) => Date.parse(b.startedAt!) - Date.parse(a.startedAt!))[0]
  if (!event?.startedAt) return undefined
  const startedAt = Date.parse(event.startedAt)
  const elapsed = now - startedAt
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined
  const key = `padel-kaos:special-event:${tournament.id}:${audience}:${event.id}:${startedAt}`
  if (audience === 'court_display' || audience === 'main_display') return elapsed < SPECIAL_EVENT_REVEAL_MS ? {event,elapsed,key} : undefined
  if (sessionStorage.getItem(`${key}:dismissed`) === 'yes') return undefined
  if (elapsed < SPECIAL_EVENT_REVEAL_MS) sessionStorage.setItem(`${key}:entered`,'yes')
  return sessionStorage.getItem(`${key}:entered`) === 'yes' ? {event,elapsed,key} : undefined
}

export function dismissSpecialEventReveal(key:string) {
  sessionStorage.setItem(`${key}:dismissed`,'yes')
  window.dispatchEvent(new Event(SPECIAL_EVENT_DISMISSED_EVENT))
}
