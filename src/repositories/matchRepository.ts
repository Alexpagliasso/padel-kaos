import { dataProvider } from '.'
import { useDemoMatchRepository } from './demo/demoRepositories'
import { useSupabaseMatchRepository } from './supabase/supabaseRepositories'
import { useSelectedTournamentStore } from '../features/tournament/selectedTournamentStore'

export function useMatchRepository() {
  const selectedTournamentId = useSelectedTournamentStore(state => state.selectedTournamentId)
  const demoRepository = useDemoMatchRepository()
  const supabaseRepository = useSupabaseMatchRepository(selectedTournamentId)
  return dataProvider === 'supabase' ? supabaseRepository : demoRepository
}
