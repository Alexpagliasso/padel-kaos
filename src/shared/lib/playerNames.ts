import type { Player } from '../types/domain'

export function getPlayerDisplayName(player: Pick<Player, 'firstName' | 'lastName' | 'name'>) {
  const fullName = `${player.firstName} ${player.lastName}`.trim()
  return fullName || player.name
}

export function splitLegacyPlayerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}
