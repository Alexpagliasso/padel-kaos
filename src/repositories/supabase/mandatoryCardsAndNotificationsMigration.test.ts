import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../../supabase/migrations/202609180004_mandatory_round_cards_and_live_notifications.sql', import.meta.url), 'utf8')

describe('mandatory round cards and card-play notifications migration', () => {
  it('persists the selected exact hand size and reports every incomplete team hand', () => {
    expect(sql).toContain('add column cards_per_team integer not null default 3')
    expect(sql).toContain('assigned_cards=cards_per_team')
    expect(sql).toContain("'expected_cards',cards_per_team,'assigned_cards',assigned_cards")
    expect(sql).toContain('update public.rounds set cards_per_team=p_cards_per_team')
    expect(sql).toContain('perform public.sync_round_card_readiness(p_round_id)')
  })

  it('gates referee opening and every authoritative Set 1 transition while allowing cards-off tournaments', () => {
    expect(sql).toContain('perform public.assert_round_cards_ready(p_round_id)')
    expect(sql).toContain('perform public.assert_round_cards_ready(v_match.round_id)')
    expect(sql).toContain("if p_action='start_set_1' then")
    expect(sql).toContain("case when not coalesce(c.cards_enabled,false) then true")
    expect(sql).toContain('after update of cards_enabled on public.tournaments')
    expect(sql).toContain("raise exception 'round cards incomplete: %'")
    expect(sql).not.toMatch(/start_set_1[\s\S]{0,400}assign_round_cards/)
  })

  it('publishes a stable card-usage identity and keeps Il Prescelto under referee validation', () => {
    expect(sql).toContain("v_requires_validation:=v_validate or lower(v_definition.name)='il prescelto' or v_definition.slug='il-prescelto'")
    expect(sql).toContain('returning id into v_usage_id')
    expect(sql).toContain("'card_usage_id',v_usage_id")
    expect(sql).toContain("'requires_referee_validation',v_requires_validation")
  })

  it('exposes only pending played cards to scoped displays when the persisted switch is enabled', () => {
    expect(sql).toContain('display_card_notifications_enabled boolean not null default true')
    expect(sql).toContain("p.role='court_display'::public.app_role and p.court_id=m.court_id")
    expect(sql).toContain("t.display_card_notifications_enabled and match_cards.status='pending'::public.card_status")
    expect(sql).toContain("p.role='main_display'::public.app_role")
    expect(sql).toContain("match_events.type<>'CARD_PLAYED'::public.match_event_type or t.display_card_notifications_enabled")
    expect(sql).not.toMatch(/court_display[\s\S]{0,180}status='available'/)
    expect(sql).not.toMatch(/main_display[\s\S]{0,180}status='available'/)
  })
})
