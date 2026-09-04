import type { DataProvider } from './contracts'

export const dataProvider: DataProvider =
  import.meta.env.VITE_DATA_PROVIDER === 'supabase' ? 'supabase' : 'demo'

export function isSupabaseProvider() {
  return dataProvider === 'supabase'
}
