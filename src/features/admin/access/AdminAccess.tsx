import { AccessManagementPanel } from '../../auth/AccessManagementPanel'
import { RlsDebugPanel } from '../../auth/RlsDebugPanel'
import { useTournament } from '../../tournament/useTournament'
import { AdminPageState } from '../dashboard/AdminDashboard'

export function AdminAccess() {
  const { data: tournament, error, isLoading } = useTournament()

  if (isLoading) return <AdminPageState title="Loading access management" />
  if (error) return <AdminPageState title="Unable to load access management" detail={error} tone="error" />

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">Access Management</p>
        <h1 className="mt-2 text-3xl font-black">{tournament.name}</h1>
      </header>
      <AccessManagementPanel tournament={tournament} />
      <RlsDebugPanel tournament={tournament} />
    </main>
  )
}
