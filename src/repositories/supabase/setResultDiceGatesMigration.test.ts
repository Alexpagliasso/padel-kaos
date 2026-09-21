import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql=readFileSync('supabase/migrations/202609170002_set_result_and_global_dice_gates.sql','utf8')
describe('L.1.1 forward migration',()=>{
  it('gates Set 2 on historical result, global dice and lineup',()=>{
    expect(sql).toContain("not public.has_valid_completed_set_result(v_match.id,1)")
    expect(sql).toContain("global dice must be rolled before set 2")
    expect(sql).toContain('public.match_lineup_ready(v_match.id,2)')
  })
  it('keeps dice Admin-only, global and non-rerollable',()=>{
    expect(sql).toContain("p.role='admin'::public.app_role")
    expect(sql).toContain('public.tournament_admins')
    expect(sql).toContain('global dice already rolled')
    expect(sql).not.toContain('can_manage_match')
  })
  it('anchors card blocking to the authoritative per-match Set 2 start',()=>{
    expect(sql).toContain("v_match.set_2_started_at+make_interval")
    expect(sql).toContain('cards blocked during global dice effect')
  })
  it('uses SET_ENDED as the shared historical result model and gates STB',()=>{
    expect(sql).toContain("'SET_ENDED'::public.match_event_type")
    expect(sql).toContain("not public.has_valid_completed_set_result(v_match.id,2)")
    expect(sql).toContain("then 'super_tiebreak'::public.match_status else 'completed'::public.match_status")
  })
})
