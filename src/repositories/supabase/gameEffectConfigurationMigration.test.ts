import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

const sql=readFileSync('supabase/migrations/202609280001_game_effect_configuration.sql','utf8')
describe('V2.3 game effect migration',()=>{
  it('persists and locks a per-round authoritative dice pool',()=>{
    expect(sql).toContain('create table public.round_dice_effects')
    expect(sql).toContain('dice configuration is locked after turn start')
    expect(sql).toContain('at least one dice effect must remain enabled')
    expect(sql).toContain('configured.dice_rule_id=dr.id and configured.enabled')
  })
  it('preserves source cards and validates Jolly and Lupin resolved targets',()=>{
    expect(sql).toContain('resolved_card_definition_id')
    expect(sql).toContain('create table public.jolly_copy_targets')
    expect(sql).toContain('jolly cannot copy itself')
    expect(sql).toContain("p_kind='lupin' and target.can_be_stolen")
  })
})
