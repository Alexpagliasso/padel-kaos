import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Copy, KeyRound, Monitor, RefreshCw, ShieldCheck, Smartphone, Users } from 'lucide-react'
import type { Tournament } from '../../../shared/types/domain'
import type { ExistingProvisionedAccount } from '../../auth/accessManagementState'
import { buildUniqueTeamUsername } from '../setup/teamRosterFormState'
import {
  getProvisioningErrorMessage,
  listTournamentProvisionedAccounts,
  provisionTournamentUser,
  replaceRefereeCourtAssignments,
  resetTournamentUserPassword,
  type ProvisionedCredential,
} from '../../../services/supabase/provisioning'

export type TournamentAccessApi = {
  list: typeof listTournamentProvisionedAccounts
  provision: typeof provisionTournamentUser
  resetPassword: typeof resetTournamentUserPassword
  replaceRefereeCourts: typeof replaceRefereeCourtAssignments
}

const defaultApi: TournamentAccessApi = {
  list: listTournamentProvisionedAccounts,
  provision: provisionTournamentUser,
  resetPassword: resetTournamentUserPassword,
  replaceRefereeCourts: replaceRefereeCourtAssignments,
}

export function TournamentAccessManager({ tournament, api = defaultApi }: { tournament: Tournament; api?: TournamentAccessApi }) {
  const [accounts, setAccounts] = useState<ExistingProvisionedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [credential, setCredential] = useState<ProvisionedCredential | null>(null)
  const [refereeName, setRefereeName] = useState('')
  const [refereeUsername, setRefereeUsername] = useState('')
  const [refereeCourtId, setRefereeCourtId] = useState('')
  const [courtDrafts, setCourtDrafts] = useState<Record<string, string[]>>({})

  async function loadAccounts() {
    setLoading(true); setError('')
    try {
      const result = await api.list(tournament.id)
      setAccounts(result)
      setCourtDrafts(Object.fromEntries(result.filter(item => item.role === 'referee').map(item => [item.id, item.courtIds ?? (item.courtId ? [item.courtId] : [])])))
    } catch (caught) { setError(getProvisioningErrorMessage(caught)) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let cancelled = false
    api.list(tournament.id)
      .then(result => {
        if (cancelled) return
        setAccounts(result)
        setCourtDrafts(Object.fromEntries(result.filter(item => item.role === 'referee').map(item => [item.id, item.courtIds ?? (item.courtId ? [item.courtId] : [])])))
        setError('')
      })
      .catch(caught => { if (!cancelled) setError(getProvisioningErrorMessage(caught)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, tournament.id])

  const teamsReady = tournament.teams.filter(team => accounts.some(account => account.role === 'team' && account.teamId === team.id)).length
  const referees = accounts.filter(account => account.role === 'referee')
  const courtDisplays = accounts.filter(account => account.role === 'court_display')
  const mainDisplays = accounts.filter(account => account.role === 'main_display')
  const usedUsernames = useMemo(() => accounts.map(account => account.username), [accounts])

  async function run(key: string, operation: () => Promise<ProvisionedCredential>, success: string) {
    if (busy) return
    setBusy(key); setError(''); setNotice(''); setCredential(null)
    try { const result = await operation(); setCredential(result); await loadAccounts(); setNotice(success) }
    catch (caught) { setError(getProvisioningErrorMessage(caught)) }
    finally { setBusy('') }
  }

  function createTeam(team: Tournament['teams'][number]) {
    const username = buildUniqueTeamUsername(team.name, usedUsernames)
    return run(`team:${team.id}`, () => api.provision({ tournamentId: tournament.id, username, role: 'team', teamId: team.id, teamName: team.name }), `Accesso creato per ${team.name}.`)
  }

  function createCourtDisplay(court: Tournament['courts'][number], index: number) {
    const username = uniqueUsername(`schermo_campo_${index + 1}`, usedUsernames)
    return run(`court:${court.id}`, () => api.provision({ tournamentId: tournament.id, username, role: 'court_display', courtId: court.id, teamName: `Schermo ${court.name}` }), `Schermo configurato per ${court.name}.`)
  }

  function reset(account: ExistingProvisionedAccount) {
    return run(`reset:${account.id}`, () => api.resetPassword(tournament.id, account.id), `Password reimpostata per ${account.username}.`)
  }

  async function createReferee(event: FormEvent) {
    event.preventDefault()
    if (!refereeName.trim() || !refereeUsername.trim() || !refereeCourtId) { setError('Inserisci nome, nome utente e almeno un campo.'); return }
    await run('new-referee', () => api.provision({ tournamentId: tournament.id, username: refereeUsername.trim(), role: 'referee', courtId: refereeCourtId, teamName: refereeName.trim() }), 'Accesso arbitro creato.')
    setRefereeName(''); setRefereeUsername(''); setRefereeCourtId('')
  }

  async function saveCourts(account: ExistingProvisionedAccount) {
    if (busy) return
    setBusy(`assign:${account.id}`); setError(''); setNotice('')
    try { await api.replaceRefereeCourts(account.id, courtDrafts[account.id] ?? []); await loadAccounts(); setNotice(`Campi aggiornati per ${account.displayName}.`) }
    catch (caught) { setError(getProvisioningErrorMessage(caught)) }
    finally { setBusy('') }
  }

  async function copyUsername(username: string) {
    try { await navigator.clipboard.writeText(username); setNotice('Nome utente copiato.') }
    catch { setError('Copia non disponibile su questo dispositivo.') }
  }

  return <div className="grid gap-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Summary icon={<Users />} label="Squadre" value={`${teamsReady}/${tournament.teams.length}`} />
      <Summary icon={<ShieldCheck />} label="Arbitri" value={String(referees.length)} />
      <Summary icon={<Smartphone />} label="Schermi campo" value={`${courtDisplays.length}/${tournament.courts.length}`} />
      <Summary icon={<Monitor />} label="Main display" value={String(mainDisplays.length)} />
    </section>

    {loading ? <State text="Caricamento accessi reali del torneo…" /> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-400/40 bg-red-950/30 p-4 font-bold text-red-100">{error}</p> : null}
    {notice ? <p className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-4 font-bold text-emerald-100">{notice}</p> : null}
    {credential ? <CredentialReveal credential={credential} onClose={() => setCredential(null)} /> : null}

    {!loading ? <>
      <AccessSection title="Squadre" detail="Un accesso dedicato per ogni squadra reale iscritta." icon={<Users />}>
        {tournament.teams.map(team => {
          const account = accounts.find(item => item.role === 'team' && item.teamId === team.id)
          return <AccessCard key={team.id} title={team.name} account={account} busy={busy} onCreate={() => void createTeam(team)} onReset={reset} onCopy={copyUsername} />
        })}
        {!tournament.teams.length ? <Empty text="Nessuna squadra configurata." /> : null}
      </AccessSection>

      <AccessSection title="Arbitri" detail="Gli arbitri accedono soltanto ai campi assegnati." icon={<ShieldCheck />}>
        {referees.map(account => <article key={account.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
          <AccountHeader title={account.displayName} account={account} />
          <fieldset className="mt-3 grid gap-2" disabled={Boolean(busy)}><legend className="text-xs font-black uppercase tracking-wider text-white/45">Campi assegnati</legend>
            {tournament.courts.map(court => <label key={court.id} className="flex items-center gap-2 text-sm font-bold text-white/75"><input type="checkbox" checked={(courtDrafts[account.id] ?? []).includes(court.id)} onChange={event => setCourtDrafts(current => ({ ...current, [account.id]: event.target.checked ? [...new Set([...(current[account.id] ?? []), court.id])] : (current[account.id] ?? []).filter(id => id !== court.id) }))} />{court.name}</label>)}
          </fieldset>
          <div className="mt-4 flex flex-wrap gap-2"><SecondaryButton disabled={Boolean(busy)} onClick={() => void copyUsername(account.username)}><Copy className="size-4" /> Copia username</SecondaryButton><SecondaryButton disabled={Boolean(busy)} onClick={() => void saveCourts(account)}>Salva campi</SecondaryButton><SecondaryButton disabled={Boolean(busy)} onClick={() => void reset(account)}><RefreshCw className="size-4" /> Reimposta password</SecondaryButton></div>
        </article>)}
        <form onSubmit={createReferee} className="rounded-xl border border-dashed border-[var(--event-primary)]/40 bg-black/20 p-4">
          <p className="font-black">Crea accesso arbitro</p><p className="mt-1 text-xs text-white/45">Gli accessi sono specifici del torneo; un’identità di un altro torneo non viene spostata.</p>
          <div className="mt-3 grid gap-2"><Input label="Nome visualizzato" value={refereeName} onChange={setRefereeName} /><Input label="Nome utente" value={refereeUsername} onChange={setRefereeUsername} />
            <label className="grid gap-1 text-xs font-black uppercase text-white/50">Campo iniziale<select className="rounded-lg border border-white/10 bg-black p-3 text-sm normal-case text-white" value={refereeCourtId} onChange={event => setRefereeCourtId(event.target.value)}><option value="">Seleziona campo</option>{tournament.courts.map(court => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label>
          </div><PrimaryButton disabled={Boolean(busy)}>{busy === 'new-referee' ? 'Creazione…' : 'Crea arbitro'}</PrimaryButton>
        </form>
      </AccessSection>

      <AccessSection title="Schermi campo" detail="Ogni dispositivo usa il proprio accesso associato al campo." icon={<Smartphone />}>
        {tournament.courts.map((court, index) => { const account = courtDisplays.find(item => item.courtId === court.id); return <AccessCard key={court.id} title={court.name} account={account} busy={busy} onCreate={() => void createCourtDisplay(court, index)} onReset={reset} onCopy={copyUsername} /> })}
        {!tournament.courts.length ? <Empty text="Nessun campo configurato." /> : null}
      </AccessSection>

      <AccessSection title="Main display" detail="Accesso per il monitor principale del torneo." icon={<Monitor />}>
        {mainDisplays.map(account => <AccessCard key={account.id} title={account.displayName || 'Main display'} account={account} busy={busy} onCreate={() => undefined} onReset={reset} onCopy={copyUsername} />)}
        {!mainDisplays.length ? <AccessCard title="Main display" busy={busy} onCreate={() => void run('main', () => api.provision({ tournamentId: tournament.id, username: uniqueUsername('main_display', usedUsernames), role: 'main_display', teamName: 'Main display' }), 'Main display configurato.')} onReset={reset} onCopy={copyUsername} /> : null}
      </AccessSection>
    </> : null}

    <p className="text-center text-xs font-bold text-white/35">Ogni telefono, arbitro e schermo accede in modo indipendente con le proprie credenziali.</p>
  </div>
}

function uniqueUsername(base: string, used: string[]) { const occupied = new Set(used.map(value => value.toLowerCase())); if (!occupied.has(base)) return base; let suffix = 2; while (occupied.has(`${base}_${suffix}`)) suffix += 1; return `${base}_${suffix}` }
function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#171717] p-4"><span className="text-[var(--event-primary)]">{icon}</span><div><p className="text-xs font-black uppercase tracking-wider text-white/40">{label}</p><p className="text-2xl font-black">{value}</p></div></div> }
function AccessSection({ title, detail, icon, children }: { title: string; detail: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-[#171717] p-4 sm:p-5"><header className="mb-4 flex gap-3"><span className="text-[var(--event-primary)]">{icon}</span><div><h2 className="text-xl font-black uppercase">{title}</h2><p className="text-sm text-white/50">{detail}</p></div></header><div className="grid gap-3 lg:grid-cols-2">{children}</div></section> }
function AccountHeader({ title, account }: { title: string; account: ExistingProvisionedAccount }) { return <div><div className="flex items-center justify-between gap-2"><h3 className="font-black">{title}</h3><span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-300"><Check className="size-3" /> PRONTO</span></div><p className="mt-2 font-mono text-sm text-white/65">{account.username}</p></div> }
function AccessCard({ title, account, busy, onCreate, onReset, onCopy }: { title: string; account?: ExistingProvisionedAccount; busy: string; onCreate: () => void; onReset: (account: ExistingProvisionedAccount) => void; onCopy: (username: string) => void }) { return <article className="rounded-xl border border-white/10 bg-black/30 p-4">{account ? <><AccountHeader title={title} account={account} /><div className="flex flex-wrap gap-2"><SecondaryButton disabled={Boolean(busy)} onClick={() => void onCopy(account.username)}><Copy className="size-4" /> Copia username</SecondaryButton><SecondaryButton disabled={Boolean(busy)} onClick={() => onReset(account)}><RefreshCw className="size-4" /> {busy === `reset:${account.id}` ? 'Reimpostazione…' : 'Reimposta password'}</SecondaryButton></div></> : <><div className="flex items-center justify-between gap-2"><h3 className="font-black">{title}</h3><span className="rounded-full bg-amber-400/10 px-2 py-1 text-xs font-black text-amber-200">ACCESSO MANCANTE</span></div><PrimaryButton disabled={Boolean(busy)} onClick={onCreate}><KeyRound className="size-4" /> Crea accesso</PrimaryButton></>}</article> }
function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--event-primary)] px-4 py-2 font-black text-black disabled:opacity-45" /> }
function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type="button" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-black disabled:opacity-45" /> }
function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-xs font-black uppercase text-white/50">{label}<input className="rounded-lg border border-white/10 bg-black p-3 text-sm normal-case text-white" value={value} onChange={event => onChange(event.target.value)} /></label> }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">{text}</p> }
function State({ text }: { text: string }) { return <p className="rounded-xl border border-white/10 bg-[#171717] p-5 font-bold text-white/50">{text}</p> }
function CredentialReveal({ credential, onClose }: { credential: ProvisionedCredential; onClose: () => void }) { const [copied, setCopied] = useState(''); async function copy(label: string, value: string) { try { await navigator.clipboard.writeText(value); setCopied(`${label} copiato.`) } catch { setCopied('Copia non disponibile su questo dispositivo.') } } return <section aria-label="Credenziali temporanee" className="rounded-2xl border-2 border-[var(--event-primary)] bg-black p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-[var(--event-primary)]">Credenziali temporanee</p><h2 className="mt-1 text-xl font-black">Salvale adesso</h2><p className="mt-1 text-sm text-white/55">La password viene mostrata una sola volta e non viene salvata nell’app.</p></div><button type="button" className="rounded border border-white/15 px-3 py-2 text-xs font-black" onClick={onClose}>CHIUDI</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><CredentialValue label="Nome utente" value={credential.username} onCopy={copy} /><CredentialValue label="Password temporanea" value={credential.temporaryPassword ?? ''} onCopy={copy} /></div><button type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-black" onClick={() => void copy('Credenziali', `Username: ${credential.username}\nPassword: ${credential.temporaryPassword ?? ''}`)}><Copy className="size-4" /> COPIA CREDENZIALI</button>{copied ? <p className="mt-3 text-sm font-bold text-[var(--event-primary)]">{copied}</p> : null}</section> }
function CredentialValue({ label, value, onCopy }: { label: string; value: string; onCopy: (label: string, value: string) => void }) { return <div className="rounded-lg bg-white/5 p-3"><p className="text-xs font-black uppercase text-white/40">{label}</p><p className="mt-1 break-all font-mono font-bold">{value}</p><button type="button" className="mt-2 inline-flex items-center gap-2 text-xs font-black text-[var(--event-primary)]" onClick={() => void onCopy(label, value)}><Copy className="size-3" /> COPIA</button></div> }
