import { describe, expect, it } from 'vitest'
import { getAllowedRolesForRoute, getDefaultRouteForRole, normalizeAuthSlug, roleCanAccessRoute, usernameToTechnicalEmail } from './authIdentity'
import { credentialsToCsv } from '../../services/supabase/provisioning'

describe('auth identity helpers', () => {
  it('normalizes username and tournament slug into a technical email', () => {
    expect(usernameToTechnicalEmail('Team Red', 'Padel Kaos 2026')).toBe('team-red.padel-kaos-2026@auth.padelkaos.internal')
  })

  it('normalizes auth slugs safely', () => {
    expect(normalizeAuthSlug('  Referee 01!! ')).toBe('referee-01')
  })

  it('maps roles to default routes', () => {
    expect(getDefaultRouteForRole('admin')).toBe('/admin')
    expect(getDefaultRouteForRole('referee')).toBe('/referee')
    expect(getDefaultRouteForRole('team')).toBe('/player')
    expect(getDefaultRouteForRole('court_display')).toBe('/court-display')
    expect(getDefaultRouteForRole('main_display')).toBe('/main-display')
  })

  it('maps roles to allowed route groups', () => {
    expect(getAllowedRolesForRoute('admin')).toEqual(['admin'])
    expect(getAllowedRolesForRoute('player')).toEqual(['team'])
    expect(getAllowedRolesForRoute('referee')).toEqual(['referee'])
    expect(getAllowedRolesForRoute('court_display')).toEqual(['court_display', 'admin'])
    expect(getAllowedRolesForRoute('main_display')).toEqual(['main_display', 'admin'])

    expect(roleCanAccessRoute('admin', 'admin')).toBe(true)
    expect(roleCanAccessRoute('admin', 'main_display')).toBe(true)
    expect(roleCanAccessRoute('admin', 'court_display')).toBe(true)
    expect(roleCanAccessRoute('admin', 'player')).toBe(false)
    expect(roleCanAccessRoute('admin', 'referee')).toBe(false)
    expect(roleCanAccessRoute('team', 'player')).toBe(true)
    expect(roleCanAccessRoute('team', 'referee')).toBe(false)
    expect(roleCanAccessRoute('referee', 'referee')).toBe(true)
    expect(roleCanAccessRoute('court_display', 'court_display')).toBe(true)
    expect(roleCanAccessRoute('main_display', 'main_display')).toBe(true)
  })

  it('exports bulk credentials as csv without persisting passwords', () => {
    const csv = credentialsToCsv([
      { role: 'team', username: 'team-red', temporaryPassword: 'Temp"Pass', teamId: 'team-red' },
    ])

    expect(csv).toContain('"team-red"')
    expect(csv).toContain('"Temp""Pass"')
  })
})
