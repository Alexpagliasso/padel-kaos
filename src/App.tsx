import { TournamentSetupPage } from './features/admin/setup/TournamentSetupPage'
import { AdminRolePreviewRoute, DevelopmentBackToAdmin } from './features/admin/preview/DevelopmentPreview'
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
import { ControlRoom } from './features/admin/control-room/ControlRoom'
import { AdminAccess } from './features/admin/access/AdminAccess'
import { AdminRecovery } from './features/admin/recovery/AdminRecovery'
import { AdminCalendar } from './features/admin/calendar/AdminCalendar'
import { AdminStandings } from './features/admin/standings/AdminStandings'
import { AdminResults } from './features/admin/results/AdminResults'

function App() {
  return (
    <>
    <DevelopmentBackToAdmin />
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('admin')}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminRoute />} />
        <Route path="setup" element={<TournamentSetupPage />} />
        <Route path="teams" element={<TournamentSetupPage key="teams" initialSection="TEAMS" />} />
        <Route path="groups" element={<TournamentSetupPage key="groups" initialSection="GROUPS" />} />
        <Route path="calendar" element={<AdminCalendar />} />
        <Route path="standings" element={<AdminStandings />} />
        <Route path="results" element={<AdminResults />} />
        <Route path="appearance" element={<TournamentSetupPage key="appearance" />} />
        <Route path="control-room" element={<ControlRoom />} />
        <Route path="access" element={<AdminAccess />} />
        <Route path="recovery" element={<AdminRecovery />} />
      </Route>
      <Route path="/player/access/:token" element={<PlayerRoute />} />
      <Route path="/player/*" element={<AdminRolePreviewRoute allowedRoles={getAllowedRolesForRoute('player')}><PlayerRoute /></AdminRolePreviewRoute>} />
      <Route path="/referee/*" element={<AdminRolePreviewRoute allowedRoles={getAllowedRolesForRoute('referee')}><RefereeRoute /></AdminRolePreviewRoute>} />
      <Route path="/court-display" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('court_display')}><CourtDisplayRoute /></ProtectedRoute>} />
      <Route path="/main-display" element={<ProtectedRoute allowedRoles={getAllowedRolesForRoute('main_display')}><MainDisplayRoute /></ProtectedRoute>} />
      <Route path="*" element={<RouteFallback />} />
    </Routes>
    </>
  )
}

export default App
