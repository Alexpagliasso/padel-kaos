import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const sql=readFileSync(new URL('../../../supabase/migrations/202609180006_unified_live_events.sql',import.meta.url),'utf8')
describe('unified live events migration',()=>{
  it('commits enum additions before using the new labels',()=>{
    expect(sql.indexOf('commit;\nbegin;')).toBeGreaterThan(sql.indexOf("add value if not exists 'ROUND_COMPLETED'"))
    expect(sql.indexOf("'SET_1_STARTED'::public.match_event_type")).toBeGreaterThan(sql.indexOf('commit;\nbegin;'))
  })
  it('emits authoritative lifecycle facts without duplicating score notifications',()=>{
    for(const type of ['SET_1_STARTED','SET_2_STARTED','TIME_EXPIRED','SET_RESULT_SUBMITTED','SUPER_TIEBREAK_REQUIRED','ROUND_STARTED','ROUND_COMPLETED','CARD_REJECTED'])expect(sql).toContain(type)
    expect(sql).not.toContain("'GAME_WON'::public.match_event_type")
  })
  it('publishes the existing tournament event channel and preserves scoped tables',()=>{
    expect(sql).toContain('alter publication supabase_realtime add table public.tournament_events')
    expect(sql).not.toContain('create table public.live_events')
  })
})
