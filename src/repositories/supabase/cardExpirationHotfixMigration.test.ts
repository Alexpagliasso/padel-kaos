import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
const sql=readFileSync('supabase/migrations/202610020001_card_expiration_and_live_state.sql','utf8')
describe('timed card expiration',()=>{
  it('requires authentication and match access',()=>{expect(sql).toContain('auth.uid() is null');expect(sql).toContain('public.can_read_match(v_match_id)')})
  it('is idempotent for non-active cards',()=>{expect(sql).toContain("v_card.status<>'active'::public.card_status or v_card.expires_at is null then return v_card")})
  it('persists expiry only after the server deadline',()=>{expect(sql).toContain('statement_timestamp()<v_card.expires_at');expect(sql).toContain("status='expired'::public.card_status")})
  it('closes the unresolved usage',()=>{expect(sql).toContain("'closed_reason','timer_expired'");expect(sql).toContain('resolved_at=coalesce(resolved_at,v_now)')})
})
