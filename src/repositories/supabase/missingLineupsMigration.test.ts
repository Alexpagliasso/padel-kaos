/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/202609150012_generate_missing_round_lineups.sql', 'utf8')

describe('missing round lineups RPC contract', () => {
  it('uses target-tournament Admin membership and normalized role authorization', () => {
    expect(sql).toContain("p.role = 'admin'::public.app_role")
    expect(sql).toContain('public.tournament_admins ta')
    expect(sql).toContain('ta.tournament_id = v_round.tournament_id')
    expect(sql).not.toContain('p.tournament_id = v_round.tournament_id')
  })

  it('locks the round, matches, and existing lineups before generating atomically', () => {
    expect(sql).toContain('where r.id = p_round_id for update')
    expect(sql).toContain('order by m.id for update')
    expect(sql).toContain('order by ml.id for update of ml')
    expect(sql.trim().endsWith('commit;')).toBe(true)
  })

  it('preserves existing lineups and generates only the current set', () => {
    expect(sql).toContain('if exists (')
    expect(sql).toContain('then continue; end if')
    expect(sql).toContain("when v_match.set_1_started_at is null")
    expect(sql).toContain("v_match.status = 'set_break'::public.match_status then 2")
    expect(sql).not.toContain('on conflict')
  })

  it('selects a random unused 2-of-3 pair and derives the remaining STB pair', () => {
    expect(sql).toContain('cardinality(v_roster) <> 3')
    expect(sql).toContain('a.position < b.position')
    expect(sql).toContain('order by random()')
    expect(sql).toContain('used.set_number in (1, 2)')
    expect(sql).toContain('values (v_match.id, v_team_id, 3, v_remaining[1], v_remaining[2]')
  })

  it('returns an idempotent generated count and grants only authenticated execution', () => {
    expect(sql).toContain("'generated', v_generated")
    expect(sql).toContain('revoke execute on function public.generate_missing_round_lineups(uuid) from public, anon')
    expect(sql).toContain('grant execute on function public.generate_missing_round_lineups(uuid) to authenticated')
  })
})
