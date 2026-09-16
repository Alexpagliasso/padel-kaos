const statusLabels: Record<string, string> = {
  draft: 'Bozza', configured: 'Configurato', ready: 'Pronto', live: 'In corso', completed: 'Completato', archived: 'Archiviato',
  active: 'Attivo', scheduled: 'Programmato', lineup: 'Formazione', set_break: 'Pausa tra set', pending: 'In attesa',
  approved: 'Approvato', review: 'Da rivedere', submitted: 'Inviato', cancelled: 'Annullato',
}

export function formatStatusLabel(value: string) {
  return statusLabels[value] ?? value.replaceAll('_', ' ')
}

export const roleLabels: Record<string, string> = {
  admin: 'Admin', team: 'Squadra', referee: 'Arbitro', court_display: 'Schermo campo', main_display: 'Schermo principale',
}
