import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Login from '@mui/icons-material/Login'
import { Box, Paper, TextField, Alert, Typography } from '@mui/material'
import { PrimaryAction, TournamentLogo } from '../shared/components/Foundation'
import { dataProvider } from '../repositories'
import { useAuth } from '../features/auth/authContext'
import { getLoginButtonLabel, isLoginSubmitDisabled } from './loginRouteState'

export function LoginRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signInWithUsername, status } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (dataProvider === 'demo') return <Navigate to="/admin" replace />
  if (profile) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/admin'} replace />

  return (
    <Box component="main" sx={{ minHeight: '100svh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, alignItems: 'center', gap: 4, p: { xs: 3, md: 8 }, background: 'radial-gradient(ellipse at top left, var(--event-soft), transparent 70%)' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <TournamentLogo />
        <Typography variant="h1" sx={{ mt: 8, fontSize: 'clamp(4rem, 7vw, 8rem)' }}>GIOCA.<br />VIVI.<br />
          <Box component="span" sx={{ color: 'primary.main' }}>KAOS.</Box>
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 3 }}>Il tuo evento. La tua squadra. Il prossimo punto.</Typography>
      </Box>
      <Paper component="form" sx={{ display: 'grid', gap: 3, width: '100%', maxWidth: 460, mx: 'auto', p: { xs: 3, md: 5 } }}
        onSubmit={async (event) => {
          event.preventDefault()
          setSubmitting(true)
          setMessage('')
          try {
            const result = await signInWithUsername(username, password)
            if (result.ok) {
              navigate(result.redirectTo ?? '/admin', { replace: true })
            } else {
              setMessage(result.message ?? 'Accesso non riuscito')
            }
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Accesso non riuscito')
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Padel Kaos</p>
          <h1 className="mt-2 text-3xl font-black">Accedi</h1>
        </div>
        <TextField
          autoComplete="username"
          label="Nome utente"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <TextField
          autoComplete="current-password"
          label="Password"
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {message ? <Alert severity="error">{message}</Alert> : null}
        <PrimaryAction
          disabled={isLoginSubmitDisabled(submitting, status)}
          type="submit"
        >
          <Login fontSize="small" sx={{ mr: 1 }} />
          {getLoginButtonLabel(submitting)}
        </PrimaryAction>
      </Paper>
    </Box>
  )
}
