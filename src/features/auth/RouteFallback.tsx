import { Navigate } from 'react-router-dom'
import { dataProvider } from '../../repositories'
import { useAuth } from './authContext'
import { getRouteFallbackDecision } from './routeFallbackState'

export function RouteFallback() {
  const { profile, status } = useAuth()
  const decision = getRouteFallbackDecision({ provider: dataProvider, status, role: profile?.role })

  if (decision.type === 'loading') {
    return <main className="grid min-h-svh place-items-center bg-[#0b0b0b] font-black text-white">Caricamento</main>
  }

  return <Navigate to={decision.to} replace />
}
