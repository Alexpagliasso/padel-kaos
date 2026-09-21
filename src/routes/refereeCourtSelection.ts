export function refereeCourtStorageKey(tournamentId: string, refereeId: string) {
  return `padel-kaos:referee-court:${tournamentId}:${refereeId}`
}

export function resolveRefereeCourt(assignedCourtIds: string[], preferredCourtId: string) {
  return assignedCourtIds.includes(preferredCourtId) ? preferredCourtId : assignedCourtIds[0] ?? ''
}
