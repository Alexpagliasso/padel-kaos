import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
const sql=readFileSync('supabase/migrations/202609170004_main_display_settings.sql','utf8')
describe('L.3 display settings migration',()=>{
  it('persists auto/fixed mode, page and restrained interval',()=>{expect(sql).toContain("main_display_mode in ('auto','fixed')");expect(sql).toContain('main_display_page >= 0');expect(sql).toContain('main_display_interval_seconds in (4,5,8,10)')})
  it('uses multi-tournament Admin authorization',()=>{expect(sql).toContain('public.tournament_admins');expect(sql).toContain("p.role='admin'::public.app_role");expect(sql).not.toContain('p.tournament_id=p_tournament_id')})
  it('exposes only active cards to Main Display',()=>{expect(sql).toContain("p.role='main_display'::public.app_role and match_cards.status='active'::public.card_status");expect(sql).not.toContain("p.role='main_display'::public.app_role and match_cards.status='pending'")})
})
