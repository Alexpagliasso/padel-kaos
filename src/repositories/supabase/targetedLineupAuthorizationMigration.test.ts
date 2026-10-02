import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const sql=readFileSync('supabase/migrations/202610010007_fix_targeted_lineup_admin_authorization.sql','utf8')

describe('targeted lineup generation authorization hotfix',()=>{
  it('rejects anonymous callers',()=>{expect(sql).toContain("if auth.uid() is null then raise exception 'not authenticated'")})
  it('uses the canonical tournament membership resolved from the round',()=>{expect(sql).toContain('select * into v_round from public.rounds where id=p_round_id');expect(sql).toContain('public.is_admin_for(v_round.tournament_id)')})
  it('does not grant execution to anon or public',()=>{expect(sql).toContain('from public,anon');expect(sql).toContain('to authenticated')})
  it('keeps generation scoped to the round tournament and requested set',()=>{expect(sql).toContain('tournament_id=v_round.tournament_id');expect(sql).toContain('set_number=p_set_number')})
  it('persists directly only after the single admin authorization',()=>{expect(sql).toContain('insert into public.match_lineups');expect(sql).not.toContain('perform public.confirm_match_lineup')})
})
