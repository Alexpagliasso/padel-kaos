import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql=readFileSync(new URL('../../../supabase/migrations/202609180003_complete_round_lifecycle.sql',import.meta.url),'utf8')

describe('complete round lifecycle migration',()=>{
  it('stores authoritative duration defaults, overrides and active-set locks',()=>{
    expect(sql).toContain('default_set_duration_minutes integer not null default 15')
    expect(sql).toContain('set_duration_minutes integer')
    expect(sql).toContain('active_set_duration_minutes')
    expect(sql).toContain('set duration is locked during an active set')
  })

  it('uses one backend readiness model to gate every previous round',()=>{
    expect(sql).toContain('round_completion_readiness')
    expect(sql).toContain('assert_previous_rounds_complete')
    expect(sql).toContain("'Super Tie-Break da completare'")
    expect(sql).toContain("'Risultato finale da confermare'")
    expect(sql).toContain("when (v_readiness->>'ready')::boolean then 'completed'::public.round_status")
  })

  it('expires timed sets idempotently after a server-validated deadline',()=>{
    expect(sql).toContain('expire_timed_match_set')
    expect(sql).toContain("if v_match.status not in ('set_1','set_2') then return v_match")
    expect(sql).toContain('statement_timestamp()<v_deadline')
    expect(sql).toContain("return public.apply_match_set_action(v_match.id,v_action,v_deadline)")
  })

  it('supports audited referee submission and admin correction cascades',()=>{
    expect(sql).toContain('save_completed_match_set_result')
    expect(sql).toContain('submit_completed_match_set_result')
    expect(sql).toContain('admin_correct_match_result')
    expect(sql).toContain("'revoked_final_confirmation',v_was_confirmed")
    expect(sql).toContain('perform public.sync_round_completion(v_match.round_id)')
  })
})
