import { useState } from 'react'
import { createTournamentBackup, prepareTournamentRestore, requestTournamentReset, type TournamentBackup } from '../../../domain/recovery/tournamentBackup'
import { downloadTournamentBackup } from '../../../services/backup/downloadBackup'
import { RecoveryPanel } from '../../recovery/RecoveryPanel'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { AdminPageState } from '../dashboard/AdminDashboard'

export function AdminRecovery() {
  const { data: tournament, error, isLoading } = useAdminWorkspace()
  const [backup, setBackup] = useState<TournamentBackup | null>(null)
  const [message, setMessage] = useState('')
  const resetGate = requestTournamentReset({
    tournamentStatus: tournament.status ?? 'draft',
    hasRecentBackup: Boolean(backup),
    isAdmin: true,
  })

  if (isLoading) return <AdminPageState title="Caricamento ripristino" />
  if (error) return <AdminPageState title="Impossibile caricare il ripristino" detail={error} tone="error" />

  async function exportBackup() {
    const nextBackup = await createTournamentBackup({
      tournaments: [tournament],
      tournamentId: tournament.id,
      status: tournament.status,
    })
    setBackup(nextBackup)
    setMessage('JSON backup prepared.')
  }

  async function validateBackup() {
    if (!backup) {
      setMessage('Crea o importa un backup prima della convalida.')
      return
    }
    await prepareTournamentRestore({ backupJson: backup, existingTournaments: [] })
    setMessage('Backup is valid.')
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Backup e ripristino</p>
        <h1 className="mt-2 text-3xl font-black">{tournament.name}</h1>
      </header>
      <section className="rounded border border-white/10 bg-[#171717] p-5">
        <RecoveryPanel
          resetGate={resetGate}
          onExportBackup={() => void exportBackup()}
          onDownloadBackup={() => {
            if (!backup) {
              setMessage('Crea un backup prima di scaricarlo.')
              return
            }
            downloadTournamentBackup(backup)
          }}
          onImportBackup={() => setMessage('Import from file is not connected in this step.')}
          onValidateBackup={() => void validateBackup()}
          onRestoreBackup={() => setMessage('Restore is prepared but not executed from this UI step.')}
          onResetTournament={() => setMessage('Safe reset must be executed through the approved reset flow.')}
        />
        {message ? <p className="mt-4 text-sm font-bold text-white/60">{message}</p> : null}
        <p className="mt-4 text-sm font-bold text-white/45">Future export: PDF event package.</p>
      </section>
    </main>
  )
}
