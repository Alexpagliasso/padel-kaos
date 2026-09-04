import { Navigate } from 'react-router-dom'

export function HomeRoute() {
  return <Navigate to="/admin" replace />
}
