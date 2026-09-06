import { dataProvider } from '.'
import { useDemoTeamRepository } from './demo/demoRepositories'
import { useSupabaseTeamRepository } from './supabase/supabaseRepositories'

export function useTeamRepository() {
  const demoRepository = useDemoTeamRepository()
  const supabaseRepository = useSupabaseTeamRepository()
  return dataProvider === 'supabase' ? supabaseRepository : demoRepository
}
