import type { ReactNode } from 'react'
import { MobileRoleShell } from './Foundation'
// Compatibility wrapper. Global navigation lives only in AdminLayout.
export function RoleShell({ children, action }: { children: ReactNode; action?: ReactNode }) { return <MobileRoleShell action={action}>{children}</MobileRoleShell> }
