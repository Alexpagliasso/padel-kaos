import { PageShell } from '../../../shared/components/Foundation'
import { AccessManagementPanel } from '../../auth/AccessManagementPanel'
import { RlsDebugPanel } from '../../auth/RlsDebugPanel'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { AdminPageState } from '../dashboard/AdminDashboard'

export function AdminAccess() {
  const { data: tournament, entry, error, isLoading } = useAdminWorkspace()
  if (!entry || entry.local) return <AdminPageState title="Gestione accessi" detail="I tornei locali non hanno account di accesso. Seleziona un torneo collegato per gestire gli accessi esistenti." />

  if (isLoading) return <AdminPageState title="Caricamento gestione accessi" />
  if (error) return <AdminPageState title="Impossibile caricare la gestione accessi" detail={error} tone="error" />

  return (
    <PageShell><div className=" grid w-full max-w-7xl gap-5 ">
      <header>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Gestione accessi</p>
        <h1 className="mt-2 text-3xl font-black">{tournament.name}</h1>
      </header>
      <AccessManagementPanel tournament={tournament} />
      <RlsDebugPanel tournament={tournament} />
    </div></PageShell>
  )
}
