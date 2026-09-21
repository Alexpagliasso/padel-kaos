import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cleanupSql = readFileSync(new URL('../../../supabase/migrations/202609180005_match_scoped_card_hand_cleanup.sql', import.meta.url), 'utf8')
const assignmentSql = readFileSync(new URL('../../../supabase/migrations/202609180004_mandatory_round_cards_and_live_notifications.sql', import.meta.url), 'utf8')

describe('match-scoped card hand cleanup migration', () => {
  it('atomically closes available, pending, and active cards when the final result is confirmed', () => {
    expect(cleanupSql).toContain('matches_close_card_hand_after_confirmation')
    expect(cleanupSql).toContain('old.result_confirmed_at is null and new.result_confirmed_at is not null')
    expect(cleanupSql).toContain("when mc.status='pending'::public.card_status then 'cancelled'::public.card_status")
    expect(cleanupSql).toContain("else 'expired'::public.card_status")
    expect(cleanupSql).toContain("'available'::public.card_status")
    expect(cleanupSql).toContain("'active'::public.card_status")
    expect(cleanupSql).not.toMatch(/delete from public\.match_cards/)
  })

  it('resolves pending and active usage history without erasing activation data', () => {
    const closeFunction = cleanupSql.slice(cleanupSql.indexOf('create or replace function public.close_match_card_hand('), cleanupSql.indexOf('create or replace function public.close_match_card_hand_after_confirmation()'))
    expect(cleanupSql).toContain('rejected_at=coalesce(cu.rejected_at,v_closed_at)')
    expect(cleanupSql).toContain('resolved_at=coalesce(cu.resolved_at,v_closed_at)')
    expect(cleanupSql).toContain("'closed_reason','match_completed'")
    expect(closeFunction).not.toContain('activated_at=')
    expect(closeFunction).not.toContain('expires_at=')
  })

  it('keeps each assignment on its original match and makes every next-round hand a fresh insert', () => {
    expect(assignmentSql).toContain('insert into public.match_cards(match_id,team_id,card_definition_id)')
    expect(assignmentSql).toContain('select v_match.id,v_team_id,available.id')
    expect(assignmentSql).not.toMatch(/update public\.match_cards[\s\S]{0,160}match_id=/)
    expect(assignmentSql).toContain('where m.round_id=p_round_id')
  })

  it('keeps assignment readiness historical and scoped to the requested round', () => {
    expect(assignmentSql).toContain('from public.matches m where m.round_id=p_round_id')
    expect(assignmentSql).toContain('where mc.match_id=e.match_id and mc.team_id=e.team_id')
    expect(assignmentSql).not.toMatch(/assigned_cards[\s\S]{0,100}mc\.status/)
  })

  it('rejects terminal, completed, foreign, and unauthorized card requests', () => {
    expect(cleanupSql).toContain("v_card.status<>'available'::public.card_status")
    expect(cleanupSql).toContain("v_match.result_confirmed_at is not null or v_match.status='completed'::public.match_status")
    expect(cleanupSql).toContain("v_match.status not in ('set_1'::public.match_status,'set_2'::public.match_status,'super_tiebreak'::public.match_status)")
    expect(cleanupSql).toContain('v_card.team_id not in(v_match.team_a_id,v_match.team_b_id)')
    expect(cleanupSql).toContain('p.team_id=v_card.team_id')
  })

  it('does not reactivate historical cards when an Admin correction reopens a match', () => {
    expect(cleanupSql).toContain('after update of result_confirmed_at on public.matches')
    expect(cleanupSql).not.toMatch(/status='available'::public\.card_status[\s\S]{0,120}where mc\.match_id=p_match_id/)
  })
})
