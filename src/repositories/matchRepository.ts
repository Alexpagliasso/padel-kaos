import { dataProvider } from '.'
import { useDemoMatchRepository } from './demo/demoRepositories'
import { useSupabaseMatchRepository } from './supabase/supabaseRepositories'

export function useMatchRepository() {
  const demoRepository = useDemoMatchRepository()
  const supabaseRepository = useSupabaseMatchRepository()
  return dataProvider === 'supabase' ? supabaseRepository : demoRepository
}
