import { RESET_CONFIRMATION_PHRASE, type ResetGateResult } from '../../domain/recovery/tournamentBackup'

type RecoveryPanelProps = {
  resetGate: ResetGateResult
  onExportBackup: () => void
  onDownloadBackup: () => void
  onImportBackup: () => void
  onValidateBackup: () => void
  onRestoreBackup: () => void
  onResetTournament: () => void
}

export function RecoveryPanel({
  resetGate,
  onExportBackup,
  onDownloadBackup,
  onImportBackup,
  onValidateBackup,
  onRestoreBackup,
  onResetTournament,
}: RecoveryPanelProps) {
  return (
    <section aria-label="Ripristino Admin" className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-white/10 px-3 py-2 font-black" onClick={onExportBackup}>
          Export Backup
        </button>
        <button type="button" className="rounded border border-white/10 px-3 py-2 font-black" onClick={onDownloadBackup}>
          Scarica JSON
        </button>
        <button type="button" className="rounded border border-white/10 px-3 py-2 font-black" onClick={onImportBackup}>
          Import Backup
        </button>
        <button type="button" className="rounded border border-white/10 px-3 py-2 font-black" onClick={onValidateBackup}>
          Validate Backup
        </button>
        <button type="button" className="rounded border border-white/10 px-3 py-2 font-black" onClick={onRestoreBackup}>
          Restore
        </button>
        <button type="button" className="rounded border border-red-400/40 px-3 py-2 font-black text-red-200 disabled:opacity-40" disabled={!resetGate.allowed} onClick={onResetTournament}>
          Reimposta torneo
        </button>
      </div>
      <p className="text-xs font-black uppercase text-white/50">{RESET_CONFIRMATION_PHRASE}</p>
    </section>
  )
}
