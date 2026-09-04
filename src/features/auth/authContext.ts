import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppProfile } from './authIdentity'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type SignInResult = {
  ok: boolean
  redirectTo?: string
  message?: string
}

export type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  profile: AppProfile | null
  signInWithUsername: (username: string, password: string) => Promise<SignInResult>
  reauthenticateForReset: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  refreshProfile: () => Promise<AppProfile | null>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
