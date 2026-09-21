import type { Tournament } from '../../shared/types/domain'
import { DICE_REVEAL_MS, getLatestDiceReveal } from './diceShow'

export type DiceAudience = 'admin' | 'team' | 'referee' | 'court_display' | 'main_display'
export const DICE_CONTINUE_MS = 5500
export const DICE_DISMISSED_EVENT = 'padel-kaos:dice-dismissed'

export function openDiceReveal(tournament: Tournament, audience: DiceAudience, now: number) {
  const reveal = getLatestDiceReveal(tournament)
  if (!reveal) return undefined
  const elapsed = now - reveal.rolledAt
  if (elapsed < 0) return undefined
  const key = `padel-kaos:dice:${tournament.id}:${audience}:${reveal.round.id}:${reveal.rolledAt}`
  if (audience === 'court_display' || audience === 'main_display') {
    return elapsed < DICE_REVEAL_MS ? { ...reveal, elapsed, key } : undefined
  }
  if (sessionStorage.getItem(`${key}:dismissed`) === 'yes') return undefined
  if (elapsed < DICE_REVEAL_MS) sessionStorage.setItem(`${key}:entered`, 'yes')
  if (sessionStorage.getItem(`${key}:entered`) !== 'yes') return undefined
  return { ...reveal, elapsed, key }
}

export function dismissDiceReveal(key: string) {
  sessionStorage.setItem(`${key}:dismissed`, 'yes')
  window.dispatchEvent(new Event(DICE_DISMISSED_EVENT))
}
