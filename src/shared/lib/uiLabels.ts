const statusLabels: Record<string, string> = {
  draft: 'Bozza', configured: 'Configurato', ready: 'Pronto', live: 'In corso', completed: 'Completato', archived: 'Archiviato',
  active: 'Attivo', scheduled: 'Programmato', lineup: 'Formazione', set_break: 'Pausa tra set', pending: 'In attesa',
  live_set_1: 'Set 1 in corso', live_set_2: 'Set 2 in corso', super_tiebreak: 'Super Tie-Break',
  waiting_for_global_dice: 'In attesa del dado', kaos_pending: 'In attesa del dado', kaos_active: 'Effetto dado attivo',
  approved: 'Approvato', review: 'Da rivedere', submitted: 'Inviato', cancelled: 'Annullato',
}

export function formatStatusLabel(value: string) {
  return statusLabels[value] ?? value.replaceAll('_', ' ')
}

export const roleLabels: Record<string, string> = {
  admin: 'Admin', team: 'Squadra', referee: 'Arbitro', court_display: 'Schermo campo', main_display: 'Schermo principale',
}
