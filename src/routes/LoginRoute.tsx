import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
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
    <main className="grid min-h-svh place-items-center bg-[#0b0b0b] px-4 text-white">
      <form
        className="grid w-full max-w-sm gap-4 rounded border border-white/10 bg-[#171717] p-5"
        onSubmit={async (event) => {
          event.preventDefault()
          setSubmitting(true)
          setMessage('')
          try {
            const result = await signInWithUsername(username, password)
            if (result.ok) {
              navigate(result.redirectTo ?? '/admin', { replace: true })
            } else {
              setMessage(result.message ?? 'Login failed')
            }
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Login failed')
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">Padel Kaos</p>
          <h1 className="mt-2 text-3xl font-black">Login</h1>
        </div>
        <input
          autoComplete="username"
          className="rounded border border-white/10 bg-black px-3 py-3 font-bold"
          placeholder="Username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <input
          autoComplete="current-password"
          className="rounded border border-white/10 bg-black px-3 py-3 font-bold"
          placeholder="Password"
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {message ? <p className="text-sm font-bold text-red-200">{message}</p> : null}
        <button
          className="inline-flex items-center justify-center gap-2 rounded bg-[#FFD000] px-4 py-3 font-black text-black disabled:opacity-50"
          disabled={isLoginSubmitDisabled(submitting, status)}
          type="submit"
        >
          <LogIn className="size-4" />
          {getLoginButtonLabel(submitting)}
        </button>
      </form>
    </main>
  )
}
