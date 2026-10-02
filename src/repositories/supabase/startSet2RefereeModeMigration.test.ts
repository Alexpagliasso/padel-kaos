import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const sql=readFileSync('supabase/migrations/202610010005_start_set_2_in_referee_mode.sql','utf8')

describe('Set 2 round transition in referee mode',()=>{
  it('allows only the Set 2 global start outside centralized mode',()=>{
    expect(sql).toContain("v_mode<>'centralized'::public.set_control_mode and p_action<>'start_set_2'")
  })
  it('requires submitted Set 1 results, dice and every Set 2 lineup',()=>{
    expect(sql).toContain('m.set_1_result_submitted_at is null')
    expect(sql).toContain('global dice must be rolled before set 2')
    expect(sql).toContain('public.match_lineup_ready')
  })
  it('starts every match and persists the round Set 2 state',()=>{
    expect(sql).toContain('public.apply_match_set_action(v_match.id,p_action,v_now)')
    expect(sql).toContain("when 'start_set_2' then 'set_2'::public.round_status")
  })
})
