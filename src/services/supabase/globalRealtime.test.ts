import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { subscribeToTournamentGlobalOccurrences, type GlobalRealtimeAudience } from './globalRealtime'

type Listener = { filter: Record<string, string>; callback: (payload: { new?: Record<string, unknown> }) => void }

function realtimeHarness() {
  const listeners = new Map<string, Listener>()
  let statusCallback: ((status: string) => void) | undefined
  const channel = {
    on: vi.fn((_type: string, filter: Record<string, string>, callback: Listener['callback']) => {
      listeners.set(filter.table, { filter, callback })
      return channel
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => { statusCallback = callback; return channel }),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
  return { client, listeners, subscribed: () => statusCallback?.('SUBSCRIBED') }
}

describe('tournament global realtime', () => {
  it.each<GlobalRealtimeAudience>(['admin','team','referee','court_display','main_display'])(
    'subscribes %s to tournament-scoped dice and special event occurrences', audience => {
      const harness = realtimeHarness()
      const received = vi.fn()
      const recovery = vi.fn()
      subscribeToTournamentGlobalOccurrences(harness.client as unknown as Pick<SupabaseClient, 'channel' | 'removeChannel'>, 'tournament-1', audience, received, recovery)

      expect(harness.listeners.get('rounds')?.filter).toMatchObject({ event: 'UPDATE', filter: 'tournament_id=eq.tournament-1' })
      expect(harness.listeners.get('global_events')?.filter).toMatchObject({ event: '*', filter: 'tournament_id=eq.tournament-1' })
      harness.listeners.get('rounds')?.callback({ new: { id: 'round-2', dice_rolled_at: '2026-09-25T10:00:00Z' } })
      harness.listeners.get('global_events')?.callback({ new: { id: 'event-7', started_at: '2026-09-25T10:01:00Z' } })
      harness.subscribed()

      expect(received).toHaveBeenNthCalledWith(1, { kind: 'dice', tournamentId: 'tournament-1', roundId: 'round-2', occurredAt: '2026-09-25T10:00:00Z' })
      expect(received).toHaveBeenNthCalledWith(2, { kind: 'special_event', tournamentId: 'tournament-1', eventId: 'event-7', occurredAt: '2026-09-25T10:01:00Z' })
      expect(recovery).toHaveBeenCalledOnce()
    },
  )

  it('removes exactly the channel it created', async () => {
    const harness = realtimeHarness()
    const unsubscribe = subscribeToTournamentGlobalOccurrences(harness.client as unknown as Pick<SupabaseClient, 'channel' | 'removeChannel'>, 'tournament-1', 'team', vi.fn(), vi.fn())
    await unsubscribe()
    expect(harness.client.removeChannel).toHaveBeenCalledOnce()
  })
})
