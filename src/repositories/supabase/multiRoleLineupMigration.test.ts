import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

const sql=readFileSync(new URL('../../../supabase/migrations/202609300001_multi_role_lineup_management.sql',import.meta.url),'utf8').toLowerCase()

describe('multi-role lineup migration',()=>{
  it('authorizes teams only for their own team',()=>{expect(sql).toContain("v_profile.role='team'::public.app_role");expect(sql).toContain('v_profile.team_id=p_team_id')})
  it('authorizes referees through current court assignments',()=>{expect(sql).toContain("v_profile.role='referee'::public.app_role");expect(sql).toContain('public.can_referee_access_court')})
  it('authorizes only tournament admins for Regia',()=>{expect(sql).toContain("v_profile.role='admin'::public.app_role");expect(sql).toContain('public.is_admin_for(v_match.tournament_id)')})
  it('locks started sets and rejects reused pairs',()=>{expect(sql).toContain('lineup phase already started');expect(sql).toContain('pair already used in this match')})
  it('keeps concurrent requests unique and preserves confirmed lineups',()=>{expect(sql).toContain('on conflict(match_id,team_id,set_number)');expect(sql).toContain('if exists(select 1 from public.match_lineups where match_id=v_match.id')})
  it('selects unused pairs and derives the remaining super tie-break pair',()=>{expect(sql).toContain('no unique super tie-break pair remains');expect(sql.match(/set_number in\(1,2\)/g)?.length).toBeGreaterThan(1)})
  it('reports incomplete rosters without aborting other matches',()=>{expect(sql).toContain("'skipped',v_skipped");expect(sql).toContain('la rosa deve contenere esattamente tre giocatori')})
})
