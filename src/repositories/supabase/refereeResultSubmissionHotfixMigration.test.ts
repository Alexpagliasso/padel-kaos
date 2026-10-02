import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
const sql=readFileSync('supabase/migrations/202610010003_referee_current_set_result_submission.sql','utf8')
describe('referee current-phase result submission hotfix',()=>{
  it('allows referee/admin submission only after end or canonical deadline',()=>{expect(sql).toContain("p.role='referee'");expect(sql).toContain("p.role='admin'");expect(sql).toContain("raise exception 'set deadline has not elapsed'");expect(sql).toContain('persist_completed_set_result')})
  it('submits idempotently without advancing match status',()=>{expect(sql).toContain('return v_match;');expect(sql).toContain('set_1_result_submitted_at');expect(sql).toContain('set_2_result_submitted_at');expect(sql).not.toMatch(/set status\s*=/)})
})
