import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/202609220001_result_uuid_and_live_referee_assignments.sql', 'utf8')
const assignmentSchema = readFileSync('supabase/migrations/202609150009_referee_court_assignments.sql', 'utf8')

describe('result and assignment migration contract', () => {
  it('expands a returned matches composite into the row variable in both correction paths', () => {
    expect(sql.match(/select \* into v_match from public\.reconcile_match_after_set_results\(p_match_id,(?:true|false)\)/g)).toHaveLength(2)
    expect(sql).not.toMatch(/select public\.reconcile_match_after_set_results\([^;]+into v_match/)
    expect(sql).toContain("'SCORE_CORRECTED'::public.match_event_type")
    expect(sql).toContain('perform public.sync_round_completion(v_match.round_id)')
  })

  it('keeps assignment changes authorized, tournament scoped and court unique', () => {
    expect(sql).toContain('if not public.live_admin_authorized(p_tournament_id)')
    expect(sql).toContain("p.role = 'referee'::public.app_role")
    expect(sql).toContain('c.tournament_id = p_tournament_id')
    expect(sql).toContain('delete from public.referee_court_assignments')
    expect(sql).toContain('insert into public.referee_court_assignments')
    expect(sql).toContain('public.can_referee_access_court')
    expect(assignmentSchema).toContain('primary key (tournament_id, court_id)')
    expect(assignmentSchema).not.toMatch(/unique\s*\(referee_user_id\)/)
    expect(sql).not.toContain("v_status not in ('draft','configured')")
    expect(sql).toContain('p_referee_user_id uuid default null')
  })
})
