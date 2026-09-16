/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/202609150011_live_orchestration_foundation.sql', 'utf8')

describe('live orchestration SQL contract', () => {
  it('loads composite rows separately from scalar INTO targets', () => {
    expect(sql).not.toMatch(/select\s+r\s*,\s*t\.set_control_mode\s+into/i)
    expect(sql).not.toMatch(/select\s+m\s*,\s*t\.set_control_mode/i)
    expect(sql.match(/select r\.\* into v_round/gi)).toHaveLength(2)
    expect(sql).toContain('select m.* into v_match')
  })

  it('persists both set control modes and authoritative timestamps', () => {
    expect(sql).toContain("enum ('centralized', 'referee')")
    expect(sql).toContain('set_control_mode public.set_control_mode not null')
    expect(sql).toContain('opened_at timestamptz')
    expect(sql).toContain('v_now timestamptz := clock_timestamp()')
    expect(sql).toContain('set_1_started_at=p_now')
    expect(sql).toContain('set_2_started_at=p_now')
  })

  it('draws the requested number for both teams of every match in one transaction', () => {
    expect(sql).toContain('for v_match in select * from public.matches where round_id = p_round_id')
    expect(sql).toContain('foreach v_team_id in array array[v_match.team_a_id, v_match.team_b_id]')
    expect(sql).toContain('limit p_cards_per_team')
    expect(sql).toContain('if v_inserted <> p_cards_per_team')
    expect(sql.trim().endsWith('commit;')).toBe(true)
  })

  it('rejects duplicate draw and requires an explicit pre-start redraw', () => {
    expect(sql).toContain("if not p_redraw then raise exception 'cards already assigned'")
    expect(sql).toContain("raise exception 'cards cannot be assigned after turn start'")
    expect(sql).toContain("mc.status <> 'available'::public.card_status")
  })

  it('keeps private card RLS unchanged', () => {
    expect(sql).not.toContain('drop policy')
    expect(sql).not.toContain('create policy')
  })

  it('blocks centralized start until every match has both lineups', () => {
    expect(sql).toContain('public.match_lineup_ready(m.id')
    expect(sql).toContain("raise exception 'one or more match lineups are missing'")
    expect(sql).toContain('for v_match in select * from public.matches where round_id=p_round_id order by id loop')
  })

  it('opens referee mode and authorizes normalized multi-court assignments only', () => {
    expect(sql).toContain("v_mode <> 'referee'::public.set_control_mode")
    expect(sql).toContain('public.referee_court_assignments rca')
    expect(sql).toContain('rca.referee_user_id=p.id')
    expect(sql).toContain('rca.court_id=v_match.court_id')
    expect(sql).not.toContain('p.court_id=v_match.court_id')
  })

  it('requires tournament membership for Regia and rejects unauthorized roles', () => {
    expect(sql).toContain("p.role = 'admin'::public.app_role")
    expect(sql).toContain('ta.tournament_id = p_tournament_id')
    expect(sql).toContain("p.role='referee'::public.app_role")
    expect(sql).toContain("raise exception 'not authorized'")
  })

  it('rejects duplicate lifecycle transitions and removes legacy bypasses', () => {
    expect(sql).toContain("raise exception 'invalid or duplicate set transition'")
    expect(sql).toContain('revoke execute on function public.start_match(uuid) from authenticated')
    expect(sql).toContain('revoke execute on function public.draw_match_cards(uuid) from authenticated')
    expect(sql).toContain('revoke execute on function public.end_set(uuid) from authenticated')
    expect(sql).toContain('revoke execute on function public.start_second_set(uuid) from authenticated')
  })
})
