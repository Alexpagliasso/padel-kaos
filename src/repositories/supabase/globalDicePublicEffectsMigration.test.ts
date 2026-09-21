import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'
const sql=readFileSync('supabase/migrations/202609170003_authoritative_dice_and_public_card_effects.sql','utf8')
describe('L.2 migration',()=>{
  it('seeds exactly the six stable product faces for every existing tournament',()=>{
    for(const code of ['one_vs_one','three_vs_three','deflated_balls','tennis_balls','single_serve','no_glass']) expect(sql).toContain(code)
    expect(sql).toContain('from public.tournaments t cross join')
    expect(sql).toContain('on conflict(tournament_id,dice_value) do update')
  })
  it('restricts the server random pool and prevents rerolls',()=>{
    expect(sql).toContain("dr.product_code in ('one_vs_one','three_vs_three','deflated_balls','tennis_balls','single_serve','no_glass')")
    expect(sql).toContain('order by random() limit 1')
    expect(sql).toContain('global dice already rolled')
    expect(sql).toContain('dice_rolled_at=clock_timestamp()')
  })
  it('exposes only active opponent effects to a participating team',()=>{
    expect(sql).toContain("p.team_id=match_cards.team_id")
    expect(sql).toContain("p.team_id in(m.team_a_id,m.team_b_id) and match_cards.status='active'::public.card_status")
    expect(sql).not.toContain("match_cards.status='pending'::public.card_status")
  })
})
