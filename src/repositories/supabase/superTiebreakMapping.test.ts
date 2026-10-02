import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
const source=readFileSync('src/repositories/supabase/mappers/tournamentMapper.ts','utf8')
describe('Super Tie-Break mapping',()=>{
  it('keeps the canonical state distinct from Set 2 live',()=>{expect(source).toContain("if (status === 'set_2') return 'live_set_2'");expect(source).toContain("if (status === 'super_tiebreak') return 'super_tiebreak'");expect(source).not.toContain("status === 'set_2' || status === 'super_tiebreak'")})
})
