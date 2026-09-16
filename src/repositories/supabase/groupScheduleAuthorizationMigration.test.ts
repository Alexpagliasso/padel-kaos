import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/202609150010_fix_group_schedule_admin_authorization.sql'
const sql = readFileSync(migrationPath, 'utf8')
const authorization = sql.slice(
  sql.indexOf('-- Lock both identity'),
  sql.indexOf("if v_status not in ('draft', 'configured')"),
)

describe('group schedule multi-tournament authorization migration', () => {
  it('requires an authenticated Admin profile with target tournament membership', () => {
    expect(sql).toContain('if auth.uid() is null then')
    expect(authorization).toContain('from public.profiles p')
    expect(authorization).toContain('join public.tournament_admins ta on ta.user_id = p.id')
    expect(authorization).toContain('where p.id = auth.uid()')
    expect(authorization).toContain("p.role = 'admin'::public.app_role")
    expect(authorization).toContain('ta.tournament_id = p_tournament_id')
    expect(authorization).toContain('for share of p, ta')
    expect(authorization).not.toContain('p.tournament_id = p_tournament_id')
    expect(authorization).toContain("raise exception 'not authorized'")
  })

  it('keeps execute limited to authenticated callers', () => {
    expect(sql).toContain('revoke execute on function public.replace_group_stage_schedule(uuid, jsonb) from public, anon;')
    expect(sql).toContain('grant execute on function public.replace_group_stage_schedule(uuid, jsonb) to authenticated;')
  })

  it('preserves the hardened definer context and multi-court coverage validation', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = pg_catalog, public, pg_temp')
    expect(sql).toContain('from public.referee_court_assignments rca')
    expect(sql).toContain('rca.court_id = g.assigned_court_id')
    expect(sql).toContain("raise exception 'every assigned group court requires exactly one referee'")
  })

  it('preserves validation before the atomic delete and insert', () => {
    const validation = sql.indexOf('Validate the complete graph before deleting any existing schedule rows')
    const runtimeGuard = sql.indexOf("raise exception 'cannot replace a group-stage schedule with runtime data'")
    const deleteMatches = sql.indexOf('delete from public.matches m using public.rounds r')
    const insertMatches = sql.indexOf('insert into public.matches (')

    expect(validation).toBeGreaterThan(0)
    expect(runtimeGuard).toBeGreaterThan(validation)
    expect(deleteMatches).toBeGreaterThan(runtimeGuard)
    expect(insertMatches).toBeGreaterThan(deleteMatches)
    expect(sql.trim().startsWith('-- Restore multi-tournament Admin authorization')).toBe(true)
    expect(sql.trim().endsWith('commit;')).toBe(true)
  })
})
