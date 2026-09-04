import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { dataProvider } from '../../repositories'
import { useAuth } from './authContext'
import { getProtectedRouteDecision } from './protectedRouteState'

type ProtectedRouteProps = {
  allow: 'admin' | 'referee' | 'player' | 'court_display' | 'main_display'
  children: ReactNode
}

export function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const location = useLocation()
  const { profile, status } = useAuth()
  const decision = getProtectedRouteDecision({ provider: dataProvider, status, role: profile?.role, allow })

  if (decision.type === 'allow') return children
  if (decision.type === 'loading') {
    return <main className="grid min-h-svh place-items-center bg-[#0b0b0b] font-black text-white">Loading</main>
  }
  if (decision.type === 'login') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Navigate to={decision.to} replace />
}
