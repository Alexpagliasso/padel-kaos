import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'
import { diceImagePath,mapDiceEffectRow } from '../diceEffectRepository'
import { getDiceFace } from '../../domain/live/diceShow'

const migration=readFileSync('supabase/migrations/202609280002_dice_effect_library.sql','utf8')
describe('Dice Effect Library',()=>{
  it('supports an unbounded library and create/edit metadata with stable identity',()=>{
    expect(migration).toContain('drop constraint if exists dice_rules_dice_value_check')
    expect(migration).toContain('create or replace function public.create_dice_effect')
    expect(migration).toContain('create or replace function public.update_dice_effect')
    expect(migration).toContain("'custom_'||replace(v_id::text,'-','')")
  })
  it('requires exactly six distinct enabled tournament effects',()=>{
    expect(migration).toContain('cardinality(p_enabled_rule_ids)<>6')
    expect(migration).toContain('count(distinct id)')
    expect(migration).toContain('dr.tournament_id=v_round.tournament_id and dr.enabled')
  })
  it('rolls only from the six persisted round effects without canonical product-code filtering',()=>{
    expect(migration).toContain('join public.dice_rules dr on dr.id=rde.dice_rule_id')
    expect(migration).toContain('rde.round_id=p_round_id and rde.enabled and dr.enabled')
    expect(migration).not.toContain("dr.product_code in ('one_vs_one'")
  })
  it('maps custom artwork and presentation metadata dynamically',()=>{
    const rule=mapDiceEffectRow({id:'custom',dice_value:9,title:'CAMPO RISTRETTO',description:'Gioca nel corridoio.',long_description:'Descrizione completa.',image_url:'https://cdn.test/custom.webp',effect_type:'custom',duration_seconds:300,product_code:'custom_1',enabled:true})
    const face=getDiceFace(rule,4)!
    expect(face).toMatchObject({title:'CAMPO RISTRETTO',shortDescription:'Gioca nel corridoio.',artwork:'https://cdn.test/custom.webp'})
    expect(diceImagePath('tournament','custom','upload','image/webp')).toBe('tournament/custom/upload.webp')
  })
})
