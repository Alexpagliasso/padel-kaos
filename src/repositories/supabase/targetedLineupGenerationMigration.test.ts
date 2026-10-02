import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
const sql=readFileSync('supabase/migrations/202610010006_targeted_round_lineup_generation.sql','utf8')
describe('targeted round lineup generation',()=>{
  it('requires an explicit Set 1 or Set 2 target',()=>{expect(sql).toContain('p_set_number integer');expect(sql).toContain('p_set_number not in(1,2)')})
  it('identifies existing lineups by match, team and requested set',()=>{expect(sql).toContain('match_id=v_match.id and team_id=v_team and set_number=p_set_number')})
  it('keeps confirmed lineups and selects an unused pair',()=>{expect(sql).toContain('ml.set_number in(1,2)');expect(sql).toContain('public.confirm_match_lineup(v_match.id,v_team,p_set_number')})
  it('returns authoritative completeness and remaining targets',()=>{expect(sql).toContain("'remaining',v_remaining");expect(sql).toContain("'complete',v_remaining=0");expect(sql).toContain('ml.confirmed_at is not null')})
})
