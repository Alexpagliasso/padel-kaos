import { Outlet } from 'react-router-dom'
import { RoleShell } from '../../../shared/components/RoleShell'
import { useAuth } from '../../auth/authContext'
import { AdminNavigation } from './AdminSideNavigation'

export function AdminLayout() {
  const { logout } = useAuth()

  return (
    <RoleShell>
      <div className="md:grid md:grid-cols-[auto_1fr]">
        <AdminNavigation onLogout={() => void logout()} />
        <Outlet />
      </div>
    </RoleShell>
  )
}
