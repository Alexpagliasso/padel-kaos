/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/202609170001_referee_live_match_core.sql', 'utf8')

describe('referee live match SQL contract', () => {
  it('scores and corrects the active set atomically without ending it', () => {
    expect(sql).toContain('increment_match_set_game')
    expect(sql).toContain('set_match_set_score')
    expect(sql).toContain('for update')
    expect(sql).toContain("score_update_source='manual'")
    expect(sql).not.toMatch(/set_match_set_score[\s\S]*status\s*=\s*'set_break'/)
    expect(sql).toContain('where m.id=p_match_id for update')
    expect(sql).toContain('matches_persist_timed_set_score')
    expect(sql).toContain("'SET_ENDED'::public.match_event_type")
    expect(sql).toContain('new.games_a:=0; new.games_b:=0')
  })

  it('authorizes referee scoring through normalized court assignments', () => {
    expect(sql).toContain('public.referee_court_assignments')
    expect(sql).toContain('rca.referee_user_id=p.id')
    expect(sql).toContain('rca.court_id=v_match.court_id')
    expect(sql).not.toContain('p.court_id=v_match.court_id')
  })

  it('keeps Team request and referee confirmation as separate transitions', () => {
    expect(sql).toContain('request_match_card_use')
    expect(sql).toContain("status='pending'::public.card_status")
    expect(sql).toContain('confirm_match_card_use')
    expect(sql).toContain("'active'::public.card_status")
    expect(sql).toContain('reject_match_card_use')
  })

  it('validates Il Prescelto against the current active pair', () => {
    expect(sql).toContain("v_definition.slug='il-prescelto'")
    expect(sql).toContain('ml.set_number=v_match.current_set')
    expect(sql).toContain('p_selected_player_id in (ml.active_player_1_id,ml.active_player_2_id)')
  })

  it('uses authoritative activation and expiry timestamps', () => {
    expect(sql).toContain('v_now timestamptz:=clock_timestamp()')
    expect(sql).toContain('make_interval(secs=>v_definition.duration_value)')
    expect(sql).toContain("jsonb_build_object('selected_player_id',p_selected_player_id")
  })

  it('publishes only the operational tables needed for realtime refresh', () => {
    expect(sql).toContain('alter publication supabase_realtime add table public.matches')
    expect(sql).toContain('alter publication supabase_realtime add table public.match_cards')
    expect(sql).toContain('alter publication supabase_realtime add table public.card_usages')
  })
})
