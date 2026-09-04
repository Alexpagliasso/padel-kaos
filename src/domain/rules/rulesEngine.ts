import type {
  CardDefinition,
  DiceRule,
  GenderStartingScore,
  Match,
  MatchLineup,
  Player,
  Team,
  TeamCard,
} from '../../shared/types/domain'

export type GenderAwareLineup = {
  activePlayers: Pick<Player, 'id' | 'gender'>[]
}

export function validateLineup(team: Team, lineup: MatchLineup, previous?: MatchLineup) {
  const playerIds = new Set(team.players.map((player) => player.id))
  const selectedIds = [...lineup.activePlayerIds, lineup.benchPlayerId]

  if (selectedIds.length !== new Set(selectedIds).size) {
    return { valid: false, reason: 'Ogni giocatore puo comparire una sola volta nella lineup.' }
  }

  if (!selectedIds.every((playerId) => playerIds.has(playerId))) {
    return { valid: false, reason: 'La lineup contiene giocatori fuori squadra.' }
  }

  if (previous && !lineup.activePlayerIds.includes(previous.benchPlayerId)) {
    return {
      valid: false,
      reason: 'Il giocatore rimasto fuori nel set precedente deve entrare nel set successivo.',
    }
  }

  return { valid: true }
}

export function getRequiredRotation(previous: MatchLineup) {
  return {
    mustIncludePlayerId: previous.benchPlayerId,
    previousBenchPlayerId: previous.benchPlayerId,
  }
}

export function buildGenderAwareLineup(team: Team, lineup: MatchLineup): GenderAwareLineup {
  return {
    activePlayers: lineup.activePlayerIds
      .map((playerId) => team.players.find((player) => player.id === playerId))
      .filter((player): player is Player => Boolean(player)),
  }
}

export function calculateGenderStartingScore(
  teamALineup: GenderAwareLineup,
  teamBLineup: GenderAwareLineup,
): GenderStartingScore {
  const teamAWomenCount = countActiveWomen(teamALineup)
  const teamBWomenCount = countActiveWomen(teamBLineup)
  const difference = teamAWomenCount - teamBWomenCount

  if (difference === 0) return { teamA: 0, teamB: 0 }
  if (difference > 0) return { teamA: clampStartingScore(difference), teamB: 0 }
  return { teamA: 0, teamB: clampStartingScore(Math.abs(difference)) }
}

function countActiveWomen(lineup: GenderAwareLineup) {
  return lineup.activePlayers.filter((player) => player.gender === 'woman').length
}

function clampStartingScore(value: number): 0 | 1 | 2 {
  if (value >= 2) return 2
  if (value === 1) return 1
  return 0
}

export function canPlayCard(params: {
  match: Match
  teamCard: TeamCard
  card: CardDefinition
  teamId: string
  timing: CardDefinition['activationTiming']
}) {
  const { match, teamCard, card, teamId, timing } = params

  if (!canPlayCardInMatch(match, teamId, [teamCard]).allowed) {
    return canPlayCardInMatch(match, teamId, [teamCard])
  }
  if (teamCard.teamId !== teamId) return { allowed: false, reason: 'Carta non assegnata alla squadra.' }
  if (teamCard.state !== 'available') return { allowed: false, reason: 'Carta gia usata o non disponibile.' }
  if (!card.enabled) return { allowed: false, reason: 'Carta disabilitata.' }
  if (card.activationTiming !== 'anytime' && card.activationTiming !== timing) {
    return { allowed: false, reason: 'Timing di attivazione non valido.' }
  }

  return { allowed: true }
}

export function canScorePoint(match: Match) {
  if (match.status === 'completed') return { allowed: false, reason: 'Partita terminata.' }
  if (match.status === 'kaos_pending' || match.status === 'set_break' || match.status === 'lineup_set_2') {
    return {
      allowed: false,
      reason: 'Prima di iniziare il secondo set devi completare il KAOS DICE.',
    }
  }
  if (match.score.currentSet === 2 && !match.currentKaosEventId) {
    return {
      allowed: false,
      reason: 'Prima di iniziare il secondo set devi completare il KAOS DICE.',
    }
  }
  return {
    allowed: match.status === 'live_set_1' || match.status === 'live_set_2' || match.status === 'live',
    reason: 'La partita non e in una fase live.',
  }
}

export function canPlayCardInMatch(
  match: Match,
  teamId: string,
  teamCards: TeamCard[],
  options: { isDiceEffectActive?: boolean } = {},
) {
  const scorePermission = canScorePoint(match)
  if (!scorePermission.allowed) return scorePermission
  if (options.isDiceEffectActive) {
    return { allowed: false, reason: 'Non puoi usare carte durante effetto dado globale.' }
  }
  const alreadyUsedThisSet = teamCards.some(
    (card) =>
      card.teamId === teamId
      && card.usedInSet === match.score.currentSet
      && ['pending', 'active', 'used'].includes(card.state),
  )
  if (alreadyUsedThisSet) {
    return { allowed: false, reason: 'Puoi utilizzare una sola carta per set.' }
  }
  return { allowed: true }
}

export function canEndSet(match: Match) {
  return {
    allowed: match.status === 'live_set_1' || match.status === 'live',
    reason: 'Puoi terminare solo il primo set live nella demo.',
  }
}

export function canRollDice(match: Match) {
  if (match.currentKaosEventId) return { allowed: false, reason: 'Il dado e gia stato lanciato.' }
  return {
    allowed: match.status === 'kaos_pending',
    reason: 'Completa una lineup valida per il secondo set prima del Kaos Dice.',
  }
}

export function canStartSecondSet(match: Match) {
  return {
    allowed: match.status === 'kaos_reveal' && Boolean(match.currentKaosEventId),
    reason: 'Il secondo set non puo partire senza dado.',
  }
}

export function canEndMatch(match: Match) {
  return {
    allowed: match.status !== 'completed',
    reason: 'Partita gia terminata.',
  }
}

export function canStartKaosEvent(match: Match) {
  return match.score.currentSet === 2 && ['set_break', 'kaos_event', 'kaos_pending', 'kaos_reveal'].includes(match.status)
}

export function applyDiceRule(rule: DiceRule) {
  if (!rule.enabled) return { active: false, label: 'Regola dado disabilitata' }
  return {
    active: true,
    label: rule.title,
    effectType: rule.effectType,
    durationGames: rule.durationGames,
  }
}

export function canRegisterSpecialEvent(eventStatus: string, existingWinnerId?: string) {
  if (eventStatus !== 'active') return { allowed: false, reason: 'Evento globale non attivo.' }
  if (existingWinnerId) return { allowed: false, reason: 'Evento gia assegnato atomicamente.' }
  return { allowed: true }
}
