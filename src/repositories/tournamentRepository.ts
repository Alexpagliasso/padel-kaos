import { dataProvider } from '.'
import { useDemoTournamentRepository } from './demo/demoRepositories'
import { useSupabaseTournamentRepository } from './supabase/supabaseRepositories'

export function useTournamentRepository() {
  const demoRepository = useDemoTournamentRepository()
  const supabaseRepository = useSupabaseTournamentRepository(dataProvider === 'supabase')
  return dataProvider === 'supabase' ? supabaseRepository : demoRepository
}
