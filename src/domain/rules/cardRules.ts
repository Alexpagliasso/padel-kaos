import type { CardDefinition, TeamCard } from '../../shared/types/domain'

export function drawRandomCardsForTeam(deck: CardDefinition[], count: number, random = Math.random) {
  const enabledDeck = deck.filter((card) => card.enabled)
  const shuffled = shuffle(enabledDeck, random)

  if (enabledDeck.length >= count) return shuffled.slice(0, count)

  const picks: CardDefinition[] = []
  for (let index = 0; index < count; index += 1) {
    const card = enabledDeck[index % enabledDeck.length]
    if (card) picks.push(card)
  }
  return picks
}

export function canPlayCardDuringRound(params: {
  teamId: string
  teamCard: TeamCard
  card: CardDefinition
  teamCards: TeamCard[]
  isDiceEffectActive: boolean
}) {
  const { teamId, teamCard, card, teamCards, isDiceEffectActive } = params

  if (isDiceEffectActive) return { allowed: false, reason: 'Non puoi usare carte durante effetto dado globale.' }
  if (teamCard.teamId !== teamId) return { allowed: false, reason: 'Carta non assegnata alla squadra.' }
  if (teamCard.state !== 'available') return { allowed: false, reason: 'Carta non disponibile.' }

  const isPersistent = card.durationType !== 'instant'
  const hasActivePersistentCard = teamCards.some(
    (candidate) => candidate.teamId === teamId && candidate.state === 'active' && candidate.id !== teamCard.id,
  )

  if (isPersistent && hasActivePersistentCard) {
    return { allowed: false, reason: 'La squadra ha gia una carta persistente active.' }
  }

  return { allowed: true }
}

export function createTimedCardWindow(activatedAt: Date, durationSeconds: number) {
  return {
    activatedAt: activatedAt.toISOString(),
    expiresAt: new Date(activatedAt.getTime() + durationSeconds * 1000).toISOString(),
  }
}

export function decrementGameDurationCard(card: TeamCard) {
  if (typeof card.remainingGames !== 'number') return card
  const remainingGames = Math.max(card.remainingGames - 1, 0)
  return {
    ...card,
    remainingGames,
    state: remainingGames === 0 ? ('used' as const) : card.state,
  }
}

export function stealActiveCard(params: {
  stealingTeamId: string
  targetCard: TeamCard
  stealCard: TeamCard
  targetDefinition: CardDefinition
}) {
  const { stealingTeamId, targetCard, stealCard, targetDefinition } = params
  if (!targetDefinition.canBeStolen || targetCard.state !== 'active') {
    return { ok: false, reason: 'Carta non rubabile.' }
  }
  return {
    ok: true,
    stolenCard: {
      ...targetCard,
      teamId: stealingTeamId,
      stolenFromTeamId: targetCard.teamId,
    },
    usedStealCard: {
      ...stealCard,
      state: 'used' as const,
    },
  }
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = current
  }
  return copy
}
