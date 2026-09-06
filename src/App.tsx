import { Route, Routes } from 'react-router-dom'
import { AdminRoute } from './routes/AdminRoute'
import { CourtDisplayRoute } from './routes/CourtDisplayRoute'
import { HomeRoute } from './routes/HomeRoute'
import { MainDisplayRoute } from './routes/MainDisplayRoute'
import { PlayerRoute } from './routes/PlayerRoute'
import { RefereeRoute } from './routes/RefereeRoute'
import { LoginRoute } from './routes/LoginRoute'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { RouteFallback } from './features/auth/RouteFallback'
import { getAllowedRolesForRoute } from './features/auth/authIdentity'
import { AdminLayout } from './features/admin/layout/AdminLayout'
import { TournamentSetup } from './features/admin/setup/TournamentSetup'
import { ControlRoom } from './features/admin/control-room/ControlRoom'
import { AdminAccess } from './features/admin/access/AdminAccess'
import { AdminRecovery } from './features/admin/recovery/AdminRecovery'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('admin')}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminRoute />} />
        <Route path="setup" element={<TournamentSetup />} />
        <Route path="control-room" element={<ControlRoom />} />
        <Route path="access" element={<AdminAccess />} />
        <Route path="recovery" element={<AdminRecovery />} />
      </Route>
      <Route path="/player/access/:token" element={<PlayerRoute />} />
      <Route path="/player/*" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('player')}><PlayerRoute /></ProtectedRoute>} />
      <Route path="/referee/*" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('referee')}><RefereeRoute /></ProtectedRoute>} />
      <Route path="/court-display" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('court_display')}><CourtDisplayRoute /></ProtectedRoute>} />
      <Route path="/main-display" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('main_display')}><MainDisplayRoute /></ProtectedRoute>} />
      <Route path="*" element={<RouteFallback />} />
    </Routes>
  )
}

export default App
