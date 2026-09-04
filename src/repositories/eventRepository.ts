import { dataProvider } from '.'
import { useDemoEventRepository } from './demo/demoRepositories'
import { useSupabaseEventRepository } from './supabase/supabaseRepositories'

export function useEventRepository() {
  const demoRepository = useDemoEventRepository()
  const supabaseRepository = useSupabaseEventRepository()
  return dataProvider === 'supabase' ? supabaseRepository : demoRepository
}
