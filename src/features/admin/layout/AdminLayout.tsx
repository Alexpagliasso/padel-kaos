import { Outlet } from 'react-router-dom'
import { RoleShell } from '../../../shared/components/RoleShell'
import { AdminNavigation } from './AdminSideNavigation'

export function AdminLayout() {
  return (
    <RoleShell>
      <div className="md:grid md:grid-cols-[auto_1fr]">
        <AdminNavigation />
        <Outlet />
      </div>
    </RoleShell>
  )
}
