import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const sql=readFileSync('supabase/migrations/202610010004_confirm_submitted_round_set.sql','utf8')

describe('submitted round set transition migration',()=>{
  it('requires every canonical Set 1 submission before moving all courts to set break',()=>{
    expect(sql).toContain('m.set_1_result_submitted_at is null')
    expect(sql).toContain('has_valid_completed_set_result(m.id,1)')
    expect(sql).toContain("status='set_break'::public.match_status")
    expect(sql).toContain("status='set_break'::public.round_status")
  })

  it('reconciles Set 2 and advances to completion or super tie-break',()=>{
    expect(sql).toContain('m.set_2_result_submitted_at is null')
    expect(sql).toContain('recalculate_match_set_wins')
    expect(sql).toContain("'super_tiebreak'::public.match_status")
    expect(sql).toContain("'completed'::public.match_status")
  })
})
