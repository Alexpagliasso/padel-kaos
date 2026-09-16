import { Box, Button, MenuItem, TextField } from '@mui/material'
import type { TeamRepositoryContract } from '../../../repositories/contracts'
import { PageShell } from '../../../shared/components/Foundation'
import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Copy, CreditCard, Download, Edit3, KeyRound, Layers3, MapPinned, Network, Trophy } from 'lucide-react'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { dataProvider, isSupabaseProvider } from '../../../repositories'
import { useTeamRepository } from '../../../repositories/teamRepository'
import { AdminPageState } from '../dashboard/AdminDashboard'
import type { Tournament } from '../../../shared/types/domain'
import {
  credentialsToCsv,
  getProvisioningErrorMessage,
  listTournamentProvisionedAccounts,
  provisionTeamAccounts,
  provisionTournamentUser,
  type ProvisionedCredential,
} from '../../../services/supabase/provisioning'
import { downloadTextFile } from '../../../shared/lib/downloadTextFile'
import {
  buildCredentialsFileName,
  findTeamAccount,
  getExistingAccountDisplay,
  type ExistingProvisionedAccount,
} from '../../auth/accessManagementState'
import {
  buildUniqueTeamUsername,
  canEditRoster,
  type CreatedTeamCredential,
  createEmptyTeamRosterDraft,
  createTeamRosterDraft,
  formatTeamRoster,
  getTeamAccountState,
  isRosterComplete,
  type PendingTeamLogin,
  toCreateTeamInput,
  validateTeamAccessDraft,
  validateTeamRosterDraft,
  type TeamRosterDraft,
} from './teamRosterFormState'
import { TeamRankingActions, TeamRankingEditor } from './TeamRankingControls'

const tabs = ['TOURNAMENT', 'TEAMS', 'GROUPS', 'COURTS', 'ROUNDS / MATCHES', 'CARDS'] as const
type SetupTab = (typeof tabs)[number]

export function TournamentSetup({ initialTab }: { initialTab?: SetupTab }) {
  const { data: tournament, error, isLoading } = useAdminWorkspace()

  if (isLoading) return <AdminPageState title="Caricamento configurazione" />
  if (error) return <AdminPageState title="Impossibile caricare la configurazione" detail={error} tone="error" />

  return <TournamentSetupContent tournament={tournament} initialTab={initialTab} />
}

export function TournamentSetupContent({
  tournament,
  initialTab = 'TOURNAMENT',
  enableTeamAccess = isSupabaseProvider(),
  embedded = false,
  repositoryOverride,
}: {
  tournament: Tournament
  initialTab?: SetupTab
  enableTeamAccess?: boolean
  embedded?: boolean
  repositoryOverride?: TeamRepositoryContract
}) {
  const [tab, setTab] = useState<SetupTab>(initialTab)
  const defaultTeamRepository = useTeamRepository()
  const teamRepository = repositoryOverride ?? defaultTeamRepository
  const [draft, setDraft] = useState<TeamRosterDraft>(() => createEmptyTeamRosterDraft())
  const [accounts, setAccounts] = useState<ExistingProvisionedAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(enableTeamAccess)
  const [accountsError, setAccountsError] = useState('')
  const [createdTeamCredentials, setCreatedTeamCredentials] = useState<CreatedTeamCredential[]>([])
  const [latestCredential, setLatestCredential] = useState<ProvisionedCredential | null>(null)
  const [pendingTeamLogin, setPendingTeamLogin] = useState<PendingTeamLogin | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  const rosterEditable = canEditRoster(tournament)
  const teamAccountsById = useMemo(() => new Map(accounts.filter((account) => account.role === 'team' && account.teamId).map((account) => [account.teamId, account])), [accounts])
  const usedTeamUsernames = useMemo(
    () => [...accounts.map((account) => account.username), ...createdTeamCredentials.map((credential) => credential.username)],
    [accounts, createdTeamCredentials],
  )
  const missingAccountTeams = useMemo(
    () => tournament.teams.filter((team) => !findTeamAccount(accounts, team.id)),
    [accounts, tournament.teams],
  )
  const generatedDraftUsername = buildUniqueTeamUsername(draft.teamName, usedTeamUsernames)

  useEffect(() => {
    let cancelled = false
    if (!enableTeamAccess) return

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
  }, [enableTeamAccess, tournament.id])

  async function saveTeam() {
    setFormMessage('')
    setFormError('')
    setCopyMessage('')
    setLatestCredential(null)
    setPendingTeamLogin(null)
    const validation = validateTeamRosterDraft(draft)
    if (!validation.valid) {
      setFormError(validation.reason)
      return
    }
    if (!draft.teamId && enableTeamAccess) {
      const accessError = validateTeamAccessDraft({ username: generatedDraftUsername })
      if (accessError) {
        setFormError(accessError)
        return
      }
    }

    setSavingTeam(true)
    try {
      const input = { ...toCreateTeamInput(draft), tournamentId: tournament.id }
      if (draft.teamId) {
        await teamRepository.updateTeam(draft.teamId, input)
        setFormMessage('Squadra aggiornata.')
      } else {
        const teamId = await teamRepository.createTeam(input)
        if (enableTeamAccess) {
          try {
            const credential = await provisionTeamLogin({
              teamId,
              teamName: input.name,
              username: generatedDraftUsername,
            })
            registerCreatedCredential(credential, input.name)
            setFormMessage('Squadra e accesso creati. Salva subito le credenziali.')
          } catch (caughtError) {
            setPendingTeamLogin({
              teamId,
              teamName: input.name,
              username: generatedDraftUsername,
            })
            setFormError(`Squadra creata, creazione accesso non riuscita. ${getProvisioningErrorMessage(caughtError)}`)
            return
          }
        } else {
          setFormMessage('Squadra creata.')
        }
      }
      setDraft(createEmptyTeamRosterDraft())
      await refreshAccounts()
    } catch (caughtError) {
      setFormError(`Creazione squadra nel database non riuscita. ${caughtError instanceof Error ? caughtError.message : 'Impossibile salvare la squadra.'}`)
    } finally {
      setSavingTeam(false)
    }
  }

  async function retryPendingTeamLogin() {
    if (!pendingTeamLogin) return
    setSavingTeam(true)
    setFormError('')
    setFormMessage('')
    setCopyMessage('')
    try {
      const credential = await provisionTeamLogin({
        teamId: pendingTeamLogin.teamId,
        teamName: pendingTeamLogin.teamName,
        username: pendingTeamLogin.username,
      })
      registerCreatedCredential(credential, pendingTeamLogin.teamName)
      setPendingTeamLogin(null)
      setDraft(createEmptyTeamRosterDraft())
      setFormMessage('Accesso creato. Salva subito le credenziali.')
      await refreshAccounts()
    } catch (caughtError) {
      setFormError(getProvisioningErrorMessage(caughtError))
    } finally {
      setSavingTeam(false)
    }
  }

  async function provisionTeamLogin(input: { teamId: string; teamName: string; username: string }) {
    return provisionTournamentUser({
      tournamentId: tournament.id,
      username: input.username,
      role: 'team',
      teamId: input.teamId,
      teamName: input.teamName,
    })
  }

  function registerCreatedCredential(credential: ProvisionedCredential, teamName: string) {
    const createdCredential = {
      teamName: credential.teamName ?? teamName,
      username: credential.username,
      temporaryPassword: credential.temporaryPassword ?? '',
    }
    setLatestCredential({ ...credential, teamName: createdCredential.teamName })
    setCreatedTeamCredentials((current) => [...current, createdCredential])
  }

  async function refreshAccounts() {
    if (!enableTeamAccess) return
    const nextAccounts = await listTournamentProvisionedAccounts(tournament.id)
    setAccounts(nextAccounts)
    setAccountsError('')
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(`${label} copied.`)
    } catch {
      setCopyMessage(`${label} copy unavailable.`)
    }
  }

  function downloadSessionCredentials() {
    downloadTextFile(
      buildCredentialsFileName(),
      credentialsToCsv(createdTeamCredentials.map((credential) => ({
        role: 'team',
        teamName: credential.teamName,
        username: credential.username,
        temporaryPassword: credential.temporaryPassword,
      }))),
      'text/csv',
    )
  }

  async function createMissingTeamLogins() {
    setSavingTeam(true)
    setFormError('')
    setFormMessage('')
    setCopyMessage('')
    setLatestCredential(null)
    try {
      const credentials = await provisionTeamAccounts({
        tournamentId: tournament.id,
        teams: buildBulkTeamProvisionInputs(missingAccountTeams, usedTeamUsernames),
      })
      credentials.forEach((credential) => registerCreatedCredential(credential, credential.teamName ?? credential.username))
      setFormMessage(`${credentials.length} accessi squadra creati. Salva subito le credenziali.`)
      await refreshAccounts()
    } catch (caughtError) {
      setFormError(getProvisioningErrorMessage(caughtError))
    } finally {
      setSavingTeam(false)
    }
  }

  function updateDraft(nextDraft: TeamRosterDraft) {
    setDraft(nextDraft)
  }

  function updateTeamName(teamName: string) {
    setDraft((current) => ({
      ...current,
      teamName,
      access: {
        ...current.access,
        username: teamName,
      },
    }))
  }

  return (
    <PageShell embedded={embedded}><div className=" grid w-full max-w-7xl gap-5 ">
      {!embedded && <><header>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Configurazione torneo</p>
        <h1 className="mt-2 text-3xl font-black">{tournament.name}</h1>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-white/10 pb-3">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            className={`shrink-0 rounded px-3 py-2 text-sm font-black ${tab === item ? 'bg-[var(--event-primary)] text-black' : 'bg-white/10 text-white/70'}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav></>}

      {tab === 'TOURNAMENT' ? (
        <SetupPanel icon={Trophy} title="Torneo">
          <InfoGrid rows={[
            ['Name', tournament.name],
            ['Status', tournament.status ?? 'unknown'],
            ['Phase', tournament.phase ?? 'GROUP_STAGE'],
            ['Provider', dataProvider],
          ]} />
        </SetupPanel>
      ) : null}

      {tab === 'TEAMS' ? (
        <SetupPanel icon={Layers3} title="Squadre">
          <TeamRankingActions tournament={tournament} repository={teamRepository} onMessage={setFormMessage} onError={setFormError} />
          <TeamRosterForm
            draft={draft}
            disabled={!rosterEditable || savingTeam}
            onDraftChange={updateDraft}
            onTeamNameChange={updateTeamName}
            onSave={() => void saveTeam()}
            message={formMessage}
            error={formError}
            isEditing={Boolean(draft.teamId)}
            isSupabase={enableTeamAccess}
            pendingTeamLogin={pendingTeamLogin}
            latestCredential={latestCredential}
            copyMessage={copyMessage}
            onCopy={copyText}
            onRetryLogin={() => void retryPendingTeamLogin()}
            generatedUsername={generatedDraftUsername}
          />
          {enableTeamAccess ? (
            <TeamCredentialsToolbar
              credentialsCount={createdTeamCredentials.length}
              missingTeamsCount={missingAccountTeams.length}
              disabled={savingTeam || accountsLoading || Boolean(accountsError)}
              onBulkCreate={() => void createMissingTeamLogins()}
              onDownload={downloadSessionCredentials}
            />
          ) : null}
          {!rosterEditable ? (
            <p className="mb-4 rounded border border-[var(--event-primary)]/30 bg-[var(--event-primary)]/10 p-3 text-sm font-bold text-[var(--event-primary)]">
              Roster is read-only when tournament status is {tournament.status}.
            </p>
          ) : null}
          {tournament.teams.length === 0 ? <EmptySetupState label="Nessuna squadra configurata" /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {tournament.teams.map((team) => (
                <article key={team.id} className="rounded border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-black">{team.name}</h2>
                    <div className="flex items-center gap-2">
                      {!isRosterComplete(team) ? (
                        <span className="rounded border border-red-400/40 px-2 py-1 text-xs font-black text-red-100">ROSTER INCOMPLETE</span>
                      ) : null}
                      <span className="rounded px-2 py-1 text-xs font-black text-black" style={{ background: team.color }}>{team.shortName}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-white/60">
                    {formatTeamRoster(team).map((playerName) => <p key={playerName}>{playerName}</p>)}
                    {team.players.length === 0 ? <p>Nessun giocatore configurato</p> : null}
                  </div>
                  <TeamRankingEditor key={`${team.id}-${team.ranking ?? 'none'}`} tournament={tournament} team={team} repository={teamRepository} onMessage={setFormMessage} onError={setFormError} />
                  <button
                    type="button"
                    disabled={!rosterEditable}
                    className="mt-4 inline-flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => setDraft(createTeamRosterDraft(team))}
                  >
                    <Edit3 className="size-4" />
                    Edit
                  </button>
                  {enableTeamAccess ? (
                    <TeamAccountStatus
                      team={team}
                      account={teamAccountsById.get(team.id)}
                      loading={accountsLoading}
                      error={accountsError}
                      disabled={savingTeam}
                      onCreateLogin={async () => {
                        setSavingTeam(true)
                        setFormError('')
                        setFormMessage('')
                        setLatestCredential(null)
                        const username = buildUniqueTeamUsername(team.name, usedTeamUsernames)
                        try {
                          const credential = await provisionTeamLogin({ teamId: team.id, teamName: team.name, username })
                          registerCreatedCredential(credential, team.name)
                          setFormMessage('Accesso creato. Salva subito le credenziali.')
                          await refreshAccounts()
                        } catch (caughtError) {
                          setFormError(getProvisioningErrorMessage(caughtError))
                        } finally {
                          setSavingTeam(false)
                        }
                      }}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </SetupPanel>
      ) : null}

      {tab === 'GROUPS' ? (
        <SetupPanel icon={Network} title="Gironi">
          <SimpleList items={tournament.groups.map((group) => group.name)} emptyLabel="Nessun girone configurato" />
        </SetupPanel>
      ) : null}

      {tab === 'COURTS' ? (
        <SetupPanel icon={MapPinned} title="Courts">
          <SimpleList items={tournament.courts.map((court) => court.name)} emptyLabel="Nessun campo configurato" />
        </SetupPanel>
      ) : null}

      {tab === 'ROUNDS / MATCHES' ? (
        <SetupPanel icon={CalendarPlus} title="Turni / Partite">
          <div className="grid gap-4 lg:grid-cols-2">
            <SimpleList items={(tournament.rounds ?? []).map((round) => `${round.name} · ${round.status}`)} emptyLabel="Nessun turno configurato" />
            <SimpleList items={tournament.matches.map((match) => {
              const teamA = tournament.teams.find((team) => team.id === match.teamAId)
              const teamB = tournament.teams.find((team) => team.id === match.teamBId)
              return `${teamA?.name ?? 'TBD'} vs ${teamB?.name ?? 'TBD'} · ${match.status}`
            })} emptyLabel="Nessuna partita configurata" />
          </div>
        </SetupPanel>
      ) : null}

      {tab === 'CARDS' ? (
        <SetupPanel icon={CreditCard} title="Carte">
          <SimpleList items={tournament.cards.map((card) => `${card.name} · ${card.durationType}`)} emptyLabel="Nessuna carta configurata" />
        </SetupPanel>
      ) : null}
    </div></PageShell>
  )
}

function TeamRosterForm({
  draft,
  disabled,
  onDraftChange,
  onTeamNameChange,
  onSave,
  message,
  error,
  isEditing,
  isSupabase,
  pendingTeamLogin,
  latestCredential,
  copyMessage,
  generatedUsername,
  onCopy,
  onRetryLogin,
}: {
  draft: TeamRosterDraft
  disabled: boolean
  onDraftChange: (draft: TeamRosterDraft) => void
  onTeamNameChange: (teamName: string) => void
  onSave: () => void
  message: string
  error: string
  isEditing: boolean
  isSupabase: boolean
  pendingTeamLogin: PendingTeamLogin | null
  latestCredential: ProvisionedCredential | null
  copyMessage: string
  generatedUsername: string
  onCopy: (label: string, value: string) => Promise<void>
  onRetryLogin: () => void
}) {
  return (
    <Box component="form"
      className="mb-5 grid gap-4 rounded border border-white/10 bg-black/35 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled) onSave()
      }}
    >
      <Box>
        <TextField
          className="rounded bg-black px-3 py-3 text-white"
          disabled={disabled}
          label="Nome squadra"
          value={draft.teamName}
          onChange={(event) => onTeamNameChange(event.target.value)}
        />
      </Box>
      <div className="grid gap-3 lg:grid-cols-3">
        {draft.players.map((player, index) => (
          <fieldset key={player.id ?? index} className="grid gap-2 rounded border border-white/10 p-3">
            <legend className="px-1 text-sm font-black uppercase text-[var(--event-primary)]">Giocatore {index + 1}</legend>
            <TextField
              className="rounded bg-black px-3 py-3 text-white"
              disabled={disabled}
              label="First name"
              value={player.firstName}
              onChange={(event) => updateDraftPlayer(draft, index, { firstName: event.target.value }, onDraftChange)}
            />
            <TextField
              className="rounded bg-black px-3 py-3 text-white"
              disabled={disabled}
              label="Last name"
              value={player.lastName}
              onChange={(event) => updateDraftPlayer(draft, index, { lastName: event.target.value }, onDraftChange)}
            />
            <TextField select label="Gender"
              className="rounded bg-black px-3 py-3 text-white"
              disabled={disabled}
              value={player.gender}
              onChange={(event) => updateDraftPlayer(draft, index, { gender: event.target.value as TeamRosterDraft['players'][number]['gender'] }, onDraftChange)}
            >
              <MenuItem value="">Gender</MenuItem>
              <MenuItem value="male">Male</MenuItem>
              <MenuItem value="female">Female</MenuItem>
            </TextField>
          </fieldset>
        ))}
      </div>
      {!isEditing && isSupabase ? (
        <div className="grid gap-3 rounded border border-[var(--event-primary)]/25 bg-[var(--event-primary)]/10 p-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-[var(--event-primary)]" />
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Accesso squadra</p>
          </div>
          <div className="rounded bg-black/70 p-3">
            <p className="text-xs font-black uppercase text-white/35">Nome utente</p>
            <p className="mt-1 font-mono text-white">{generatedUsername || 'Generated from team name'}</p>
          </div>
          <p className="text-sm font-bold text-white/65">La password viene generata automaticamente dal server.</p>
        </div>
      ) : null}
      {error ? <p className="rounded border border-red-400/40 bg-red-950/20 p-3 text-sm font-bold text-red-100">{error}</p> : null}
      {message ? <p className="rounded border border-emerald-400/40 bg-emerald-950/20 p-3 text-sm font-bold text-emerald-100">{message}</p> : null}
      {copyMessage ? <p className="text-sm font-bold text-[var(--event-primary)]">{copyMessage}</p> : null}
      {pendingTeamLogin ? (
        <div className="grid gap-3 rounded border border-red-400/40 bg-red-950/20 p-4">
          <p className="font-black text-red-100">Squadra creata, creazione accesso non riuscita</p>
          <p className="text-sm font-bold text-red-100/70">{pendingTeamLogin.teamName} · {pendingTeamLogin.username}</p>
          <Button type="button" disabled={disabled} className="w-fit rounded bg-white px-3 py-2 text-sm font-black text-black disabled:opacity-50" onClick={onRetryLogin}>
            Riprova creazione accesso
          </Button>
        </div>
      ) : null}
      {latestCredential ? (
        <div className="grid gap-3 rounded border border-[var(--event-primary)]/40 bg-black p-4">
          <div>
            <p className="font-black uppercase text-[var(--event-primary)]">Squadra creata</p>
            <p className="text-xs font-bold text-white/45">Salva subito queste credenziali. La password non potrà essere recuperata.</p>
          </div>
          <p className="font-black">{latestCredential.teamName}</p>
          <p className="text-xs uppercase text-white/35">Nome utente</p>
          <p className="font-mono">{latestCredential.username}</p>
          <p className="text-xs uppercase text-white/35">Temporary password</p>
          <p className="font-mono">{latestCredential.temporaryPassword ?? 'NOT RETURNED'}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-xs font-black text-black" onClick={() => onCopy('Nome utente', latestCredential.username)}>
              <Copy className="size-3" />
              Copia nome utente
            </Button>
            {latestCredential.temporaryPassword ? (
              <Button type="button" className="inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-xs font-black text-black" onClick={() => onCopy('Password', latestCredential.temporaryPassword ?? '')}>
                <Copy className="size-3" />
                Copia password
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <Button type="submit" disabled={disabled} className="rounded bg-[var(--event-primary)] px-4 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-45">
        {isEditing ? 'Salva squadra' : isSupabase ? 'Crea squadra e accesso' : 'Crea squadra'}
      </Button>
    </Box>
  )
}

function buildBulkTeamProvisionInputs(teams: Tournament['teams'], usedUsernames: string[]) {
  const nextUsedUsernames = [...usedUsernames]
  return teams.map((team) => {
    const username = buildUniqueTeamUsername(team.name, nextUsedUsernames)
    nextUsedUsernames.push(username)
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      username,
    }
  })
}

function TeamCredentialsToolbar({
  credentialsCount,
  missingTeamsCount,
  disabled,
  onBulkCreate,
  onDownload,
}: {
  credentialsCount: number
  missingTeamsCount: number
  disabled: boolean
  onBulkCreate: () => void
  onDownload: () => void
}) {
  return (
    <div className="mb-5 grid gap-3 rounded border border-[var(--event-primary)]/35 bg-[var(--event-primary)]/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Credenziali squadra</p>
          <p className="mt-1 text-sm font-bold text-white/60">{credentialsCount} credentials ready</p>
        </div>
        <button type="button" disabled={credentialsCount === 0} className="inline-flex items-center gap-2 rounded bg-[var(--event-primary)] px-4 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-45" onClick={onDownload}>
          <Download className="size-4" />
          Scarica tutte le credenziali squadre
        </button>
      </div>
      <button type="button" disabled={disabled || missingTeamsCount === 0} className="inline-flex w-fit items-center gap-2 rounded bg-white px-3 py-2 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-45" onClick={onBulkCreate}>
        <KeyRound className="size-4" />
        Genera account squadre
      </button>
      <p className="text-xs font-bold text-white/45">{missingTeamsCount} teams without accounts.</p>
    </div>
  )
}

function TeamAccountStatus({
  team,
  account,
  loading,
  error,
  disabled,
  onCreateLogin,
}: {
  team: Tournament['teams'][number]
  account?: ExistingProvisionedAccount
  loading: boolean
  error: string
  disabled: boolean
  onCreateLogin: () => Promise<void>
}) {
  if (loading) return <p className="mt-3 text-sm font-bold text-white/50">Checking account...</p>
  if (error) return <p className="mt-3 text-sm font-bold text-red-100">{error}</p>

  const state = getTeamAccountState(team, account ? [account] : [])
  if (state.status === 'active' && account) {
    const display = getExistingAccountDisplay(account, {
      id: 'status',
      name: '',
      teams: [team],
      groups: [],
      courts: [],
      matches: [],
      cards: [],
      teamCards: [],
      diceRules: [],
      kaosEvents: [],
      matchEvents: [],
      globalEvents: [],
      standings: [],
    })
    return (
      <div className="mt-4 rounded border border-emerald-400/30 bg-emerald-950/20 p-3 text-sm">
        <p className="font-black text-emerald-100">{state.label}</p>
        <p className="text-white/60">Nome utente: {display.username}</p>
        <p className="text-white/60">Account: active</p>
        <p className="font-black text-white/65">Password: non salvata</p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded border border-[var(--event-primary)]/30 bg-[var(--event-primary)]/10 p-3 text-sm">
      <p className="font-black text-[var(--event-primary)]">{state.label}</p>
      <button type="button" disabled={disabled} className="mt-2 inline-flex items-center gap-2 rounded bg-white px-3 py-2 text-sm font-black text-black disabled:opacity-50" onClick={() => void onCreateLogin()}>
        <KeyRound className="size-4" />
        Crea accesso
      </button>
    </div>
  )
}

function updateDraftPlayer(
  draft: TeamRosterDraft,
  index: number,
  patch: Partial<TeamRosterDraft['players'][number]>,
  onDraftChange: (draft: TeamRosterDraft) => void,
) {
  onDraftChange({
    ...draft,
    players: draft.players.map((player, playerIndex) => playerIndex === index ? { ...player, ...patch } : player),
  })
}

function SetupPanel({ icon: Icon, title, children }: { icon: typeof Layers3; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-white/10 bg-[#171717] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-5 text-[var(--event-primary)]" />
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded bg-black/50 p-3">
          <p className="text-xs font-black uppercase text-white/45">{label}</p>
          <p className="mt-1 font-bold">{value}</p>
        </div>
      ))}
    </div>
  )
}

function SimpleList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) return <EmptySetupState label={emptyLabel} />
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <p key={item} className="rounded bg-black/50 px-3 py-2 font-bold text-white/75">{item}</p>
      ))}
    </div>
  )
}

function EmptySetupState({ label }: { label: string }) {
  return <p className="rounded border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/55">{label}</p>
}
