import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './authContext'
import { getLogoutRedirectTarget } from './authLogout'

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const { profile, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState('')

  if (!profile) return null

  async function handleLogout() {
    setError('')
    setIsLoggingOut(true)
    try {
      await logout()
      navigate(getLogoutRedirectTarget(), { replace: true })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to logout')
      setIsLoggingOut(false)
    }
  }

  return (
    <div className={compact ? 'grid justify-items-end gap-1' : 'flex items-center gap-3'}>
      <div className={compact ? 'text-right' : ''}>
        <p className="text-xs font-black uppercase text-white/75">{profile.displayName || profile.username}</p>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{profile.role}</p>
        {error ? <p className="mt-1 max-w-48 text-xs font-bold text-red-200">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={isLoggingOut}
        className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void handleLogout()}
      >
        <LogOut className="size-4" />
        {isLoggingOut ? 'Logging out...' : 'Logout'}
      </button>
    </div>
  )
}
