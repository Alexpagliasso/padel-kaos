import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

const sql=readFileSync('supabase/migrations/202610010002_fix_match_card_composite_assignment.sql','utf8')

describe('match card composite assignment hotfix',()=>{
  it('expands the returned match_cards row before assigning it to the row variable',()=>{
    expect(sql).toContain('select requested.* into v_card')
    expect(sql).toContain('from public.request_match_card_use(p_match_card_id) requested')
    expect(sql).not.toContain('select public.request_match_card_use(p_match_card_id) into v_card')
    expect(sql).not.toContain('String(')
  })

  it('keeps the authoritative card identity in downstream writes',()=>{
    expect(sql).toContain("where id=p_match_card_id returning * into v_card")
    expect(sql).toContain("payload->>'match_card_id'=p_match_card_id::text")
  })
})
