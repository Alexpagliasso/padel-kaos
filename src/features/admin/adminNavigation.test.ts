import { describe, expect, it } from 'vitest'
import { adminNavigationItems } from './layout/adminNavItems'

describe('admin navigation', () => {
  it('exposes the separated admin sections', () => {
    expect(adminNavigationItems.map((item) => item.to)).toEqual([
      '/admin/library',
      '/admin/tournaments',
      '/admin/new',
      '/admin/setup',
      '/admin/teams',
      '/admin/groups',
      '/admin/calendar',
      '/admin/standings',
      '/admin/results',
      '/admin/control-room',
      '/admin/access',
      '/admin/appearance',
      '/admin/recovery',
    ])
    expect(adminNavigationItems.some(item=>item.label==='Panoramica')).toBe(false)
    expect(new Set(adminNavigationItems.map(item=>item.area))).toEqual(new Set(['Libreria globale','I miei tornei','Regia torneo']))
  })
})
