import { describe,expect,it } from 'vitest'
import fs from 'node:fs'

const sql=fs.readFileSync('supabase/migrations/202609180001_live_result_confirmation_and_card_duration.sql','utf8')
describe('L.4 migration',()=>it('enforces confirmation, pending-card isolation and minute normalization',()=>{
  expect(sql).toContain('result_confirmed_at')
  expect(sql).toContain('confirm_match_final_result')
  expect(sql).toContain("match_cards.status in ('pending'::public.card_status,'active'::public.card_status)")
  expect(sql).toContain('duration_value = duration_value * 60')
  expect(sql).toContain("tablename='match_lineups'")
}))
