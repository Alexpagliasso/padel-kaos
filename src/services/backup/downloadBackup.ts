import { buildBackupFileName, type TournamentBackup } from '../../domain/recovery/tournamentBackup'

export function downloadTournamentBackup(backup: TournamentBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = buildBackupFileName(backup)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
