import type { DiceRule, Round, Tournament } from '../../shared/types/domain'

export const DICE_REVEAL_MS = 12000

export type DiceFace = {
  value: 1 | 2 | 3 | 4 | 5 | 6
  productCode: string
  title: string
  shortDescription: string
  artwork: string
  rotation: { x: number; y: number; z: number }
}

export const diceFaces: readonly DiceFace[] = [
  { value: 1, productCode: 'one_vs_one', title: '1 VS 1', shortDescription: 'Per cinque minuti si gioca uno contro uno.', artwork: '/dice/1vs1-placeholder.svg', rotation: { x: 0, y: 0, z: 0 } },
  { value: 2, productCode: 'three_vs_three', title: '3 VS 3', shortDescription: 'Per cinque minuti si gioca tre contro tre.', artwork: '/dice/3vs3-placeholder.svg', rotation: { x: 0, y: -90, z: 0 } },
  { value: 3, productCode: 'deflated_balls', title: 'PALLINE SGONFIE', shortDescription: 'Per cinque minuti si usano palline sgonfie.', artwork: '/dice/palline-sgonfie-placeholder.svg', rotation: { x: 0, y: 180, z: 0 } },
  { value: 4, productCode: 'tennis_balls', title: 'PALLINE TENNIS', shortDescription: 'Per cinque minuti si usano palline da tennis.', artwork: '/dice/palline-tennis-placeholder.svg', rotation: { x: 0, y: 90, z: 0 } },
  { value: 5, productCode: 'single_serve', title: '1 SOLO SERVIZIO', shortDescription: 'Per cinque minuti è consentito un solo servizio.', artwork: '/dice/un-servizio-placeholder.svg', rotation: { x: -90, y: 0, z: 0 } },
  { value: 6, productCode: 'no_glass', title: 'NO VETRI', shortDescription: 'Per cinque minuti i vetri non sono validi.', artwork: '/dice/no-vetri-placeholder.svg', rotation: { x: 90, y: 0, z: 0 } },
]

export function getDiceFace(rule: DiceRule | undefined, result: number | undefined): DiceFace | undefined {
  if (!rule || !result) return undefined
  const face = diceFaces.find(item => item.value === result)
  return face && (!rule.productCode || rule.productCode === face.productCode) ? face : undefined
}

export function getLatestDiceReveal(tournament: Tournament): { round: Round; face: DiceFace; rolledAt: number } | undefined {
  const rounds = [...(tournament.rounds ?? [])].filter(round => round.diceRolledAt && round.diceResult && round.diceRuleId)
  rounds.sort((a, b) => Date.parse(b.diceRolledAt!) - Date.parse(a.diceRolledAt!))
  for (const round of rounds) {
    const rule = tournament.diceRules.find(item => item.id === round.diceRuleId)
    const face = getDiceFace(rule, round.diceResult)
    const rolledAt = Date.parse(round.diceRolledAt!)
    if (face && Number.isFinite(rolledAt)) return { round, face, rolledAt }
  }
}

export type DiceShowPhase = 'INTRO' | 'SPIN' | 'DECELERATE' | 'IMPACT' | 'RESULT' | 'RULE' | 'FINISHED'

export function diceShowPhase(rolledAt: number, now: number): DiceShowPhase {
  const elapsed = now - rolledAt
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= DICE_REVEAL_MS) return 'FINISHED'
  if (elapsed < 1200) return 'INTRO'
  if (elapsed < 4300) return 'SPIN'
  if (elapsed < 5300) return 'DECELERATE'
  if (elapsed < 5600) return 'IMPACT'
  if (elapsed < 5800) return 'RESULT'
  return 'RULE'
}

const spinAtEnd = { x: 1178, y: 1526 }
function targetAngle(start: number, faceAngle: number) {
  return faceAngle + Math.ceil((start - faceAngle) / 360) * 360 + 360
}

export function diceCubeRotation(face: DiceFace, elapsed: number, reducedMotion = false) {
  if (reducedMotion) return face.rotation
  if (elapsed < 1200) return { x: -18, y: -25, z: 0 }
  if (elapsed < 4300) {
    const progress = (elapsed - 1200) / 3100
    return { x: -18 + (spinAtEnd.x + 18) * progress, y: -25 + (spinAtEnd.y + 25) * progress, z: 0 }
  }
  const progress = Math.min(1, (elapsed - 4300) / 1000)
  const eased = 1 - (1 - progress) ** 3
  return {
    x: spinAtEnd.x + (targetAngle(spinAtEnd.x, face.rotation.x) - spinAtEnd.x) * eased,
    y: spinAtEnd.y + (targetAngle(spinAtEnd.y, face.rotation.y) - spinAtEnd.y) * eased,
    z: face.rotation.z,
  }
}
