export type GlobalRealtimeAudience = 'admin' | 'team' | 'referee' | 'court_display' | 'main_display'

export type GlobalOccurrence =
  | { kind: 'dice'; tournamentId: string; roundId?: string; occurredAt?: string }
  | { kind: 'special_event'; tournamentId: string; eventId?: string; occurredAt?: string }

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.info(...args) }

export function subscribeToTournamentGlobalOccurrences(
  client: Pick<SupabaseClient, 'channel' | 'removeChannel'>,
  tournamentId: string,
  audience: GlobalRealtimeAudience,
  onOccurrence: (occurrence: GlobalOccurrence) => void,
  onRecovery: () => void,
) {
  const channel = client.channel(`global-occurrences:${tournamentId}:${audience}:${crypto.randomUUID()}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'rounds', filter: `tournament_id=eq.${tournamentId}`,
    }, payload => {
      const row = (payload.new ?? {}) as Record<string, unknown>
      const occurrence: GlobalOccurrence = {
        kind: 'dice', tournamentId, roundId: stringValue(row.id), occurredAt: stringValue(row.dice_rolled_at),
      }
      devLog('[Realtime] dice occurrence received', occurrence)
      onOccurrence(occurrence)
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'global_events', filter: `tournament_id=eq.${tournamentId}`,
    }, payload => {
      const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>
      const occurrence: GlobalOccurrence = {
        kind: 'special_event', tournamentId, eventId: stringValue(row.id),
        occurredAt: stringValue(row.started_at) ?? stringValue(row.created_at),
      }
      devLog('[Realtime] special event occurrence received', occurrence)
      onOccurrence(occurrence)
    })
    .subscribe(status => {
      devLog(`[Realtime] global channel status ${status} tournament=${tournamentId} audience=${audience}`)
      if (status === 'SUBSCRIBED') {
        devLog(`[Realtime] subscribed global rounds/events tournament=${tournamentId} audience=${audience}`)
        onRecovery()
      }
    })

  return () => client.removeChannel(channel)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}
import type { SupabaseClient } from '@supabase/supabase-js'
