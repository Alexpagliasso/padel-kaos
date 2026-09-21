import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/202609180002_operational_control_center.sql', 'utf8')

describe('L.5 operational control migration', () => {
  it('persists all six independent operational switches and keeps set mode separate', () => {
    for (const column of ['referee_can_manage_score','referee_can_validate_cards','referee_can_report_event_winner','cards_enabled','dice_enabled','special_events_enabled']) {
      expect(sql).toContain(column)
    }
    expect(sql).not.toMatch(/add column\s+referee_can_control_sets/i)
  })

  it('enforces disabled mechanics inside security definer RPCs', () => {
    expect(sql).toContain('t.referee_can_manage_score')
    expect(sql).toContain("raise exception 'cards are disabled'")
    expect(sql).toContain("raise exception 'global dice is disabled or round not found'")
    expect(sql).toContain('and t.special_events_enabled')
    expect(sql).toContain('if v_dice_enabled and')
  })

  it('uses a referee report followed by an atomic Admin resolution', () => {
    expect(sql).toContain('create table public.global_event_winner_reports')
    expect(sql).toContain('function public.report_global_event_winner')
    expect(sql).toContain('function public.resolve_global_event_winner_report')
    expect(sql).toContain('for update')
    expect(sql).toContain('revoke execute on function public.claim_global_event_winner')
  })
})
