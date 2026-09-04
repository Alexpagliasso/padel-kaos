import { describe, expect, it } from 'vitest'
import { adminNavigationItems } from './layout/adminNavItems'

describe('admin navigation', () => {
  it('exposes the separated admin sections', () => {
    expect(adminNavigationItems.map((item) => item.to)).toEqual([
      '/admin',
      '/admin/setup',
      '/admin/control-room',
      '/admin/access',
      '/admin/recovery',
    ])
  })
})
