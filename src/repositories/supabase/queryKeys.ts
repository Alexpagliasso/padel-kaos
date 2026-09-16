export const supabaseTournamentKeys = {
  all: ['supabase', 'tournaments'] as const,
  list: () => [...supabaseTournamentKeys.all, 'list'] as const,
  detail: (tournamentId: string) => ['supabase', 'tournament', tournamentId] as const,
}

export const supabaseCardKeys = {
  definitions: () => ['supabase', 'card-definitions'] as const,
  tournament: (tournamentId: string) => ['supabase', 'tournament', tournamentId, 'cards'] as const,
}
