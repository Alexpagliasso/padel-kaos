import type { DemoEvent, DemoEventType } from './demoTypes'

export function createDemoEvent(input: {
  type: DemoEventType
  matchId?: string
  teamId?: string
  playerId?: string
  cardId?: string
  payload?: Record<string, unknown>
}): DemoEvent {
  return {
    id: crypto.randomUUID(),
    type: input.type,
    matchId: input.matchId,
    teamId: input.teamId,
    playerId: input.playerId,
    cardId: input.cardId,
    payload: input.payload ?? {},
    createdAt: new Date().toISOString(),
  }
}

export function pushDemoEvent(events: DemoEvent[], event: DemoEvent) {
  return [event, ...events].slice(0, 100)
}
