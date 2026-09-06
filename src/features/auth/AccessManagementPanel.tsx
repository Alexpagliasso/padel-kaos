import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Copy, Download, KeyRound, UsersRound } from 'lucide-react'
import {
  credentialsToCsv,
  getProvisioningErrorMessage,
  listTournamentProvisionedAccounts,
  provisionTeamAccounts,
  provisionTournamentUser,
  type ProvisionedCredential,
} from '../../services/supabase/provisioning'
import { downloadTextFile } from '../../shared/lib/downloadTextFile'
import type { Tournament } from '../../shared/types/domain'
import { isSupabaseProvider } from '../../repositories'
import {
  buildCredentialsFileName,
  buildProvisionPresets,
  findTeamAccount,
  getExistingAccountDisplay,
  validateSingleAccountInput,
  type ExistingProvisionedAccount,
  type PasswordMode,
  type ProvisionPreset,
} from './accessManagementState'
import type { ProvisionableRole } from './authIdentity'

export function AccessManagementPanel({ tournament, initialPasswordMode = 'auto' }: { tournament: Tournament; initialPasswordMode?: PasswordMode }) {
  const [role, setRole] = useState<ProvisionableRole>('team')
  const [username, setUsername] = useState('')
  const [assignmentId, setAssignmentId] = useState('')
  const [passwordMode, setPasswordMode] = useState<PasswordMode>(initialPasswordMode)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [lastCredentials, setLastCredentials] = useState<ProvisionedCredential[]>([])
  const [accounts, setAccounts] = useState<ExistingProvisionedAccount[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [accountsError, setAccountsError] = useState('')
  const [accountsLoading, setAccountsLoading] = useState(isSupabaseProvider())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!isSupabaseProvider()) return

    listTournamentProvisionedAccounts(tournament.id)
      .then((nextAccounts) => {
        if (!cancelled) {
          setAccounts(nextAccounts)
          setAccountsError('')
        }
      })
      .catch((caughtError) => {
        if (!cancelled) setAccountsError(getProvisioningErrorMessage(caughtError))
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tournament.id])

  const assignmentOptions = role === 'team' ? tournament.teams : role === 'referee' || role === 'court_display' ? tournament.courts : []
  const needsAssignment = role === 'team' || role === 'referee' || role === 'court_display'
  const singleInputError = validateSingleAccountInput({
    username,
    assignmentId,
    needsAssignment,
    passwordMode,
    password,
    confirmPassword,
  })
  const teamsWithoutAccounts = useMemo(
    () => tournament.teams.filter((team) => !findTeamAccount(accounts, team.id)),
    [accounts, tournament.teams],
  )
  const canCreate = !singleInputError && !loading
  const canBulkCreate = teamsWithoutAccounts.length > 0 && !loading && !accountsLoading && !accountsError

  async function createLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    setCopyMessage('')
    if (singleInputError) {
      setError(singleInputError)
      return
    }

    setLoading(true)
    try {
      const credential = await provisionTournamentUser({
        tournamentId: tournament.id,
        username: username.trim(),
        role,
        password: passwordMode === 'manual' ? password : undefined,
        teamId: role === 'team' ? assignmentId : undefined,
        teamName: role === 'team' ? tournament.teams.find((team) => team.id === assignmentId)?.name : undefined,
        courtId: role === 'referee' || role === 'court_display' ? assignmentId : undefined,
      })
      setLastCredentials([{
        ...credential,
        teamName: credential.teamName ?? (role === 'team' ? tournament.teams.find((team) => team.id === assignmentId)?.name : undefined),
      }])
      setPassword('')
      setConfirmPassword('')
      setMessage('Account created. Save the temporary password now.')
      await refreshAccounts()
    } catch (caughtError) {
      setLastCredentials([])
      setError(getProvisioningErrorMessage(caughtError))
    } finally {
      setLoading(false)
    }
  }

  async function createBulkTeamLogins() {
    setMessage('')
    setError('')
    setCopyMessage('')
    setLoading(true)
    try {
      const credentials = await provisionTeamAccounts({
        tournamentId: tournament.id,
        teams: teamsWithoutAccounts.map((team) => ({ id: team.id, name: team.name, shortName: team.shortName })),
      })
      setLastCredentials(credentials)
      setMessage(`Created ${credentials.length} accounts. Save this file now. Passwords cannot be recovered later.`)
      await refreshAccounts()
    } catch (caughtError) {
      setLastCredentials([])
      setError(getProvisioningErrorMessage(caughtError))
    } finally {
      setLoading(false)
    }
  }

  function applyPreset(preset: ProvisionPreset) {
    setRole(preset.role)
    setUsername(preset.username)
    setAssignmentId(preset.assignmentId ?? '')
    setPassword('')
    setConfirmPassword('')
    setPasswordMode('auto')
    setMessage('')
    setError('')
    setCopyMessage('')
  }

  async function refreshAccounts() {
    if (!isSupabaseProvider()) return
    const nextAccounts = await listTournamentProvisionedAccounts(tournament.id)
    setAccounts(nextAccounts)
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(`${label} copied.`)
    } catch {
      setCopyMessage(`${label} copy unavailable.`)
    }
  }

  function downloadCredentials(credentials = lastCredentials) {
    downloadTextFile(buildCredentialsFileName(), credentialsToCsv(credentials), 'text/csv')
  }

  return (
    <section className="rounded border border-white/10 bg-[#171717] p-5">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="size-5 text-[#FFD000]" />
        <h2 className="text-lg font-black">Access Management</h2>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-5">
        {buildProvisionPresets(tournament).map((preset) => (
          <button
            key={preset.username}
            type="button"
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase text-white/70 hover:border-[#FFD000]/50"
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <form className="grid gap-3 border-t border-white/10 pt-4" onSubmit={createLogin}>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Create single account</p>
        <label className="grid gap-1 text-sm font-bold text-white/70">
          Role
          <select className="rounded bg-black px-3 py-3 text-white" value={role} onChange={(event) => setRole(event.target.value as ProvisionableRole)}>
            <option value="team">Team Login</option>
            <option value="referee">Referee Login</option>
            <option value="court_display">Court Display Login</option>
            <option value="main_display">Main Display Login</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold text-white/70">
          Username
          <input className="rounded bg-black px-3 py-3 text-white" placeholder="team_red" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <p className="text-sm font-bold text-white/70">Password mode</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded border border-white/10 bg-black px-3 py-3 text-sm font-bold">
            <input type="radio" checked={passwordMode === 'auto'} onChange={() => setPasswordMode('auto')} />
            Auto generate
          </label>
          <label className="flex items-center gap-2 rounded border border-white/10 bg-black px-3 py-3 text-sm font-bold">
            <input type="radio" checked={passwordMode === 'manual'} onChange={() => setPasswordMode('manual')} />
            Manual password
          </label>
        </div>
        {passwordMode === 'manual' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold text-white/70">
              Password
              <input
                className="rounded bg-black px-3 py-3 text-white"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-white/70">
              Confirm password
              <input
                className="rounded bg-black px-3 py-3 text-white"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        {assignmentOptions.length > 0 ? (
          <label className="grid gap-1 text-sm font-bold text-white/70">
            Assignment
            <select className="rounded bg-black px-3 py-3 text-white" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
              <option value="">Assignment</option>
              {assignmentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {singleInputError ? <p className="text-xs font-bold text-white/45">{singleInputError}</p> : null}
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-white px-3 py-3 font-black text-black disabled:opacity-50" disabled={!canCreate}>
          <KeyRound className="size-4" />
          {loading ? 'Creating account...' : 'Create Login'}
        </button>
      </form>

      <div className="mt-5 grid gap-3 border-t border-white/10 pt-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Bulk team provisioning</p>
        <p className="text-sm font-bold text-white/55">
          {teamsWithoutAccounts.length} teams without accounts.
        </p>
        <button className="inline-flex items-center justify-center gap-2 rounded bg-[#FFD000] px-3 py-3 font-black text-black disabled:opacity-50" disabled={!canBulkCreate} onClick={createBulkTeamLogins}>
          <UsersRound className="size-4" />
          Generate Team Accounts
        </button>
      </div>

      {message ? <p className="mt-3 text-sm font-bold text-white/60">{message}</p> : null}
      {copyMessage ? <p className="mt-3 text-sm font-bold text-[#FFD000]">{copyMessage}</p> : null}
      {error ? <p className="mt-3 rounded border border-red-400/40 bg-red-950/20 p-3 text-sm font-bold text-red-100">{error}</p> : null}
      {lastCredentials.length > 0 ? (
        <div className="mt-4 grid gap-3 rounded bg-black p-4 text-sm">
          <div>
            <p className="font-black uppercase text-[#FFD000]">Account created</p>
            <p className="text-xs font-bold text-white/45">Save this file now. Passwords cannot be recovered later.</p>
          </div>
          {lastCredentials.map((credential) => (
            <div key={`${credential.role}-${credential.username}`} className="grid gap-2 rounded border border-white/10 p-3">
              {credential.teamName ? <p className="font-black">{credential.teamName}</p> : null}
              <p className="text-xs uppercase text-white/35">Username</p>
              <p className="font-mono">{credential.username}</p>
              <p className="text-xs uppercase text-white/35">Temporary password</p>
              <p className="font-mono">{credential.temporaryPassword ?? 'NOT RETURNED'}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-xs font-black text-black" onClick={() => copyText('Username', credential.username)}>
                  <Copy className="size-3" />
                  Copy Username
                </button>
                {credential.temporaryPassword ? (
                  <button type="button" className="inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-xs font-black text-black" onClick={() => copyText('Password', credential.temporaryPassword ?? '')}>
                    <Copy className="size-3" />
                    Copy Password
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded bg-[#FFD000] px-3 py-3 font-black text-black" onClick={() => downloadCredentials()}>
            <Download className="size-4" />
            Download Credentials
          </button>
        </div>
      ) : null}
      <div className="mt-5 grid gap-3 border-t border-white/10 pt-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Existing accounts</p>
        {accountsLoading ? <p className="text-sm font-bold text-white/50">Loading accounts...</p> : null}
        {accountsError ? <p className="rounded border border-red-400/40 bg-red-950/20 p-3 text-sm font-bold text-red-100">{accountsError}</p> : null}
        {!accountsLoading && !accountsError && accounts.length === 0 ? <p className="text-sm font-bold text-white/50">No test accounts created yet.</p> : null}
        {accounts.map((account) => {
          const display = getExistingAccountDisplay(account, tournament)
          return (
            <div key={account.id} className="grid gap-1 rounded border border-white/10 bg-white/[0.03] p-3 text-sm">
              <p className="font-black">{display.title}</p>
              <p className="text-white/55">role: {display.role}</p>
              <p className="text-white/55">username: {display.username}</p>
              <p className="text-white/55">assignment: {display.assignment}</p>
              <p className="text-white/55">status: {display.status}</p>
              <p className="font-black text-white/70">{display.passwordLabel}</p>
              <button type="button" className="mt-2 w-fit rounded border border-white/10 px-3 py-2 text-xs font-black text-white/35" disabled>
                {display.resetLabel}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
