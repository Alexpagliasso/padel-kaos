import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle, Button } from '@mui/material'
import { Copy, Download, KeyRound, UsersRound } from 'lucide-react'
import {
  credentialsToCsv,
  getProvisioningErrorMessage,
  getMissingRefereeCourts,
  listTournamentProvisionedAccounts,
  provisionTournamentOperationalAccounts,
  STANDARD_TEST_PASSWORD,
  type TournamentProvisioningResult,
  provisionTournamentUser,
  replaceRefereeCourtAssignments,
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
  const [savingAssignments, setSavingAssignments] = useState('')
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkResult, setBulkResult] = useState<TournamentProvisioningResult | null>(null)

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
  const refereeAccounts = useMemo(() => accounts.filter((account) => account.role === 'referee'), [accounts])
  const missingRefereeCourts = useMemo(
    () => getMissingRefereeCourts(tournament.courts, accounts),
    [accounts, tournament.courts],
  )
  const canCreate = !singleInputError && !loading

  async function createTournamentAccounts() {
    setBulkDialogOpen(false)
    setLoading(true)
    setError('')
    setMessage('')
    setBulkResult(null)
    try {
      const latest = await listTournamentProvisionedAccounts(tournament.id)
      const result = await provisionTournamentOperationalAccounts({ tournamentId: tournament.id,
        teams: tournament.teams, courts: tournament.courts, accounts: latest })
      setBulkResult(result)
      setLastCredentials([...result.teams.created, ...result.referees.created])
      await refreshAccounts()
      setMessage('Provisioning completato. Salva le nuove credenziali prima di uscire.')
    } catch (caughtError) {
      setError(getProvisioningErrorMessage(caughtError))
    } finally { setLoading(false) }
  }

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
      setMessage('Account creato. Salva subito la password temporanea.')
      await refreshAccounts()
    } catch (caughtError) {
      setLastCredentials([])
      setError(getProvisioningErrorMessage(caughtError))
    } finally {
      setLoading(false)
    }
  }

  async function toggleRefereeCourt(account: ExistingProvisionedAccount, courtId: string, checked: boolean) {
    const current = account.courtIds ?? (account.courtId ? [account.courtId] : [])
    const next = checked ? [...new Set([...current, courtId])] : current.filter((id) => id !== courtId)
    setSavingAssignments(account.id); setError(''); setMessage('')
    try {
      await replaceRefereeCourtAssignments(account.id, next)
      await refreshAccounts()
      setMessage('Assegnazioni arbitro aggiornate.')
    } catch (caughtError) { setError(getProvisioningErrorMessage(caughtError)) }
    finally { setSavingAssignments('') }
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
        <KeyRound className="size-5 text-[var(--event-primary)]" />
        <h2 className="text-lg font-black">Gestione accessi</h2>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-5">
        {buildProvisionPresets(tournament).map((preset) => (
          <button
            key={preset.username}
            type="button"
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase text-white/70 hover:border-[var(--event-primary)]/50"
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <form className="grid gap-3 border-t border-white/10 pt-4" onSubmit={createLogin}>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Crea account singolo</p>
        <label className="grid gap-1 text-sm font-bold text-white/70">
          Role
          <select className="rounded bg-black px-3 py-3 text-white" value={role} onChange={(event) => setRole(event.target.value as ProvisionableRole)}>
            <option value="team">Accesso squadra</option>
            <option value="referee">Accesso arbitro</option>
            <option value="court_display">Accesso schermo campo</option>
            <option value="main_display">Accesso schermo principale</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold text-white/70">
          Nome utente
          <input className="rounded bg-black px-3 py-3 text-white" placeholder="team_red" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <p className="text-sm font-bold text-white/70">Modalità password</p>
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
              Conferma password
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
          {loading ? 'Creazione accountâ€¦' : 'Crea accesso'}
        </button>
      </form>

      <div className="mt-5 grid gap-3 border-t border-white/10 pt-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Arbitri</p>
        <div className="grid gap-1 text-sm font-bold text-white/60 sm:grid-cols-3">
          <p>{tournament.courts.length} campi</p>
          <p>{refereeAccounts.length} arbitri configurati</p>
          <p>{missingRefereeCourts.length} arbitri mancanti</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-white/10 pt-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Account torneo</p>
        <p className="text-sm font-bold text-white/55">{teamsWithoutAccounts.length} squadre e {missingRefereeCourts.length} campi senza accesso arbitro.</p>
        <button type="button" className="inline-flex items-center justify-center gap-2 rounded bg-[var(--event-primary)] px-3 py-3 font-black text-black disabled:opacity-50" disabled={loading || accountsLoading || Boolean(accountsError) || teamsWithoutAccounts.length + missingRefereeCourts.length === 0} onClick={() => setBulkDialogOpen(true)}>
          <UsersRound className="size-4" />
          CREA ACCOUNT TORNEO
        </button>
      </div>

      <Dialog open={bulkDialogOpen} onClose={() => setBulkDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>CREA ACCOUNT TORNEO</DialogTitle>
        <DialogContent>
          <p>Verranno creati: {teamsWithoutAccounts.length} account squadra e {missingRefereeCourts.length} account arbitro.</p>
          <p>Password iniziale: <strong>{STANDARD_TEST_PASSWORD}</strong></p>
          <p>Gli account già esistenti saranno conservati.</p>
        </DialogContent>
        <DialogActions><Button onClick={() => setBulkDialogOpen(false)}>ANNULLA</Button><Button onClick={() => void createTournamentAccounts()}>CREA ACCOUNT</Button></DialogActions>
      </Dialog>

      {bulkResult && <div className="mt-4 rounded border border-white/10 bg-black p-4 text-sm">
        <p className="font-black uppercase text-[var(--event-primary)]">ACCOUNT CREATI</p>
        <p>Squadre: {bulkResult.teams.created.length} creati, {bulkResult.teams.existing} già esistenti, {bulkResult.teams.failed.length} errori.</p>
        <p>Arbitri: {bulkResult.referees.created.length} creati, {bulkResult.referees.existing} campi già coperti, {bulkResult.referees.failed.length} errori.</p>
        {bulkResult.referees.created.map(item => <p key={item.username}>{item.username}</p>)}
        {[...bulkResult.teams.failed, ...bulkResult.referees.failed].map(item => <p key={item.name} className="text-red-200">{item.name}: {item.reason}</p>)}
        <p>Password iniziale per i nuovi account: <strong>{STANDARD_TEST_PASSWORD}</strong></p>
      </div>}

      {message ? <p className="mt-3 text-sm font-bold text-white/60">{message}</p> : null}
      {copyMessage ? <p className="mt-3 text-sm font-bold text-[var(--event-primary)]">{copyMessage}</p> : null}
      {error ? <p className="mt-3 rounded border border-red-400/40 bg-red-950/20 p-3 text-sm font-bold text-red-100">{error}</p> : null}
      {lastCredentials.length > 0 ? (
        <div className="mt-4 grid gap-3 rounded bg-black p-4 text-sm">
          <div>
            <p className="font-black uppercase text-[var(--event-primary)]">Account created</p>
            <p className="text-xs font-bold text-white/45">Salva subito il file. Le password non potranno essere recuperate.</p>
          </div>
          {lastCredentials.map((credential) => (
            <div key={`${credential.role}-${credential.username}`} className="grid gap-2 rounded border border-white/10 p-3">
              {credential.teamName ? <p className="font-black">{credential.teamName}</p> : null}
              <p className="text-xs uppercase text-white/35">Nome utente</p>
              <p className="font-mono">{credential.username}</p>
              <p className="text-xs uppercase text-white/35">Temporary password</p>
              <p className="font-mono">{credential.temporaryPassword ?? 'NOT RETURNED'}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-xs font-black text-black" onClick={() => copyText('Nome utente', credential.username)}>
                  <Copy className="size-3" />
                  Copia nome utente
                </button>
                {credential.temporaryPassword ? (
                  <button type="button" className="inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-xs font-black text-black" onClick={() => copyText('Password', credential.temporaryPassword ?? '')}>
                    <Copy className="size-3" />
                    Copia password
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded bg-[var(--event-primary)] px-3 py-3 font-black text-black" onClick={() => downloadCredentials()}>
            <Download className="size-4" />
            Scarica credenziali
          </button>
        </div>
      ) : null}
      <div className="mt-5 grid gap-3 border-t border-white/10 pt-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Existing accounts</p>
        {accountsLoading ? <p className="text-sm font-bold text-white/50">Caricamento accountâ€¦</p> : null}
        {accountsError ? <p className="rounded border border-red-400/40 bg-red-950/20 p-3 text-sm font-bold text-red-100">{accountsError}</p> : null}
        {!accountsLoading && !accountsError && accounts.length === 0 ? <p className="text-sm font-bold text-white/50">Nessun account di test ancora creato.</p> : null}
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
              {account.role === 'referee' ? <fieldset className="mt-2 grid gap-2 border-0 p-0" disabled={savingAssignments === account.id}>
                <legend className="mb-1 text-xs font-black uppercase text-white/45">Campi assegnati</legend>
                {tournament.courts.map((court) => <label key={court.id} className="flex items-center gap-2 text-white/70">
                  <input type="checkbox" checked={(account.courtIds ?? (account.courtId ? [account.courtId] : [])).includes(court.id)} onChange={(event) => void toggleRefereeCourt(account, court.id, event.target.checked)} />
                  {court.name}
                </label>)}
              </fieldset> : null}
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
