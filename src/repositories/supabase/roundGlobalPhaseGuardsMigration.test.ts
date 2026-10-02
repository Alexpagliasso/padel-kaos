import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/202610010001_round_global_phase_guards.sql', 'utf8')
describe('round-wide phase database guards', () => {
  it('blocks Set 2 while any sibling lacks a valid submitted Set 1 result', () => { expect(sql).toContain("raise exception 'round is still in set 1'"); expect(sql).toContain('sibling.set_1_result_submitted_at is null'); expect(sql).toContain('has_valid_completed_set_result(sibling.id,1)') })
  it('keeps the global dice gate and protects Set 2 result submission', () => { expect(sql).toContain('global dice must be rolled before set 2'); expect(sql).toContain('old.set_2_result_submitted_at is null') })
  it('blocks future lineups at database level', () => { expect(sql).toContain('before insert or update of set_number on public.match_lineups'); expect(sql).toContain('new.set_number in (2,3)') })
})
