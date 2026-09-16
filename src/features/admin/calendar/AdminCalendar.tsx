import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import CalendarMonth from '@mui/icons-material/CalendarMonth'
import { generateGroupStageSchedule, type GlobalTurn } from '../../../domain/tournament/groupScheduleEngine'
import { persistedGroupStageTurns, useScheduleManagement } from '../../../repositories/scheduleRepository'
import { EmptyState, PageShell, SectionHeader } from '../../../shared/components/Foundation'
import type { Tournament } from '../../../shared/types/domain'

type CalendarView = 'turns' | 'groups'

export function AdminCalendar() {
  const management = useScheduleManagement()
  return <AdminCalendarContent key={management.data.id} management={management} />
}

function AdminCalendarContent({ management }: { management: ReturnType<typeof useScheduleManagement> }) {
  const { data: tournament, entry, referees } = management
  const [preview, setPreview] = useState<GlobalTurn[] | null>(null)
  const [view, setView] = useState<CalendarView>('turns')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const persisted = useMemo(() => persistedGroupStageTurns(tournament), [tournament])
  const checks = useMemo(() => calendarChecks(tournament, referees), [tournament, referees])
  const editable = tournament.status === 'draft' || tournament.status === 'configured'

  if (!entry) return <PageShell><EmptyState title="Seleziona un torneo" detail="Il calendario appartiene sempre al torneo selezionato." /></PageShell>
  if (management.isLoading) return <PageShell><EmptyState title="Caricamento calendario…" /></PageShell>
  if (management.error) return <PageShell><EmptyState title="Impossibile caricare il calendario salvato" detail={management.error} /></PageShell>

  function createPreview() {
    setError(''); setMessage('')
    if (persisted.length && !window.confirm('Rigenerando il calendario verranno sostituite tutte le partite della fase a gironi non ancora iniziate. Vuoi continuare?')) return
    try {
      setPreview(generateGroupStageSchedule(tournament.groups.map((group) => ({
        id: group.id, name: group.name, sortOrder: group.sortOrder,
        assignedCourtId: group.assignedCourtId ?? '',
        teamIds: tournament.teams.filter((team) => team.groupId === group.id).map((team) => team.id),
      }))))
    } catch (cause) {
      console.error('Generazione calendario non riuscita', cause)
      setError(cause instanceof Error ? cause.message : 'Impossibile generare il calendario.')
    }
  }

  async function savePreview() {
    if (!preview) return
    setPending(true); setError(''); setMessage('')
    try { await management.save(preview); setPreview(null); setMessage('Calendario salvato.') }
    catch (cause) {
      console.error('Salvataggio calendario non riuscito', cause)
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare il calendario.')
    } finally { setPending(false) }
  }

  async function assignCourt(groupId: string, courtId: string) {
    setPending(true); setError(''); setMessage('')
    try { await management.assignCourt(groupId, courtId || null) }
    catch (cause) {
      console.error('Assegnazione campo non riuscita', cause)
      setError('Impossibile assegnare il campo. Verifica che non sia già usato da un altro girone.')
    } finally { setPending(false) }
  }

  const visibleTurns = preview ?? persisted
  return <PageShell>
    <SectionHeader eyebrow="Fase a gironi" title="Calendario fase a gironi" detail="Genera l’anteprima dei Turni globali, controllala e salvala per rendere visibili le partite ai partecipanti." />
    <Stack spacing={3}>
      {!editable && <Alert severity="info">Il torneo è iniziato: il calendario è disponibile in sola lettura.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      {management.refereesError && <Alert severity="error">Impossibile verificare gli arbitri assegnati.</Alert>}
      <Summary tournament={tournament} referees={referees} turns={checks.turns} matches={checks.matches} />
      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h3" sx={{ mb: 2 }}>Preparazione</Typography>
        <Stack spacing={1.25}>{checks.items.map((item) => <Alert key={item.label} severity={item.ok ? 'success' : 'warning'}>{item.label}</Alert>)}</Stack>
        {editable && <Box sx={{ mt: 3 }}>
          <Typography sx={{ mb: 2, fontWeight: 800 }}>Assegna un campo a ogni girone</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {[...tournament.groups].sort(compareGroups).map((group) => {
              const used = new Set(tournament.groups.filter((item) => item.id !== group.id).map((item) => item.assignedCourtId).filter(Boolean))
              return <TextField key={group.id} select label={group.name} value={group.assignedCourtId ?? ''} disabled={pending} onChange={(event) => void assignCourt(group.id, event.target.value)}>
                <MenuItem value="">Nessun campo</MenuItem>
                {tournament.courts.map((court) => <MenuItem key={court.id} value={court.id} disabled={used.has(court.id)}>{court.name}</MenuItem>)}
              </TextField>
            })}
          </Box>
          {checks.missingReferee && <Button component={RouterLink} to="/admin/access" sx={{ mt: 2 }}>Gestisci arbitri in Accessi</Button>}
        </Box>}
      </Paper>
      {preview && <Alert severity="info" action={<Button color="inherit" onClick={() => setPreview(null)}>Annulla anteprima</Button>}>Anteprima non salvata</Alert>}
      {visibleTurns.length ? <ScheduleViews turns={visibleTurns} tournament={tournament} referees={referees} view={view} onView={setView} preview={Boolean(preview)} /> : <EmptyState title="Nessun calendario salvato" detail="Completa le assegnazioni, quindi genera una prima anteprima." />}
      {editable && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {!preview && <Button variant="contained" startIcon={<CalendarMonth />} disabled={!checks.ready || pending || management.refereesLoading} onClick={createPreview}>{persisted.length ? 'Rigenera anteprima' : 'Genera anteprima'}</Button>}
        {preview && <Button variant="contained" disabled={pending} onClick={() => void savePreview()}>{pending ? 'Salvataggio…' : 'Salva calendario'}</Button>}
      </Stack>}
    </Stack>
  </PageShell>
}

function Summary({ tournament, referees, turns, matches }: { tournament: Tournament; referees: Array<{ courtId: string }>; turns: number; matches: number }) {
  const assignedCourts = new Set(tournament.groups.map((group) => group.assignedCourtId).filter(Boolean)).size
  const assignedReferees = tournament.groups.filter((group) => referees.filter((referee) => referee.courtId === group.assignedCourtId).length === 1).length
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 2 }}>
    {[['Gironi', tournament.groups.length], ['Squadre', tournament.teams.length], ['Campi assegnati', `${assignedCourts}/${tournament.groups.length}`], ['Arbitri assegnati', `${assignedReferees}/${tournament.groups.length}`], ['Partite / Turni previsti', `${matches} / ${turns}`]].map(([label, value]) => <Paper key={label} sx={{ p: 2 }}><Typography color="text.secondary" variant="caption">{label}</Typography><Typography variant="h3">{value}</Typography></Paper>)}
  </Box>
}

function ScheduleViews({ turns, tournament, referees, view, onView, preview }: { turns: GlobalTurn[]; tournament: Tournament; referees: Array<{ courtId: string; name: string }>; view: CalendarView; onView: (view: CalendarView) => void; preview: boolean }) {
  const teamName = (id: string) => tournament.teams.find((team) => team.id === id)?.name ?? 'Squadra non disponibile'
  const groupName = (id: string) => tournament.groups.find((group) => group.id === id)?.name ?? 'Girone'
  const courtName = (id: string) => tournament.courts.find((court) => court.id === id)?.name ?? 'Campo'
  const refereeName = (courtId: string) => referees.find((referee) => referee.courtId === courtId)?.name ?? 'Da assegnare'
  return <Paper sx={{ overflow: 'hidden' }}>
    <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}><Typography variant="h3">{preview ? 'Anteprima' : 'Calendario salvato'}</Typography><Chip label={`${turns.length} Turni · ${turns.flatMap((turn) => turn.matches).length} partite`} /></Box>
    <Tabs value={view} onChange={(_, next: CalendarView) => onView(next)} aria-label="Vista calendario"><Tab value="turns" label="Per turno" /><Tab value="groups" label="Per girone" /></Tabs>
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {view === 'turns' ? <Stack spacing={3}>{turns.map((turn) => <Box key={turn.sequence}><Typography variant="h3" sx={{ mb: 1.5 }}>Turno {turn.sequence}</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>{turn.matches.map((match) => <MatchCard key={`${turn.sequence}-${match.groupId}`} title={courtName(match.courtId)} subtitle={groupName(match.groupId)} teams={`${teamName(match.teamAId)} vs ${teamName(match.teamBId)}`} referee={refereeName(match.courtId)} />)}</Box></Box>)}</Stack>
      : <Stack spacing={3}>{[...tournament.groups].sort(compareGroups).map((group) => {
        const matches = turns.flatMap((turn) => turn.matches.filter((match) => match.groupId === group.id).map((match) => ({ ...match, sequence: turn.sequence })))
        return <Box key={group.id}><Typography variant="h3">{group.name}</Typography><Typography color="text.secondary" sx={{ mb: 1.5 }}>{courtName(group.assignedCourtId ?? '')} · Arbitro: {refereeName(group.assignedCourtId ?? '')}</Typography><Stack spacing={1}>{matches.map((match, index) => <Typography key={`${match.sequence}-${match.teamAId}-${match.teamBId}`} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,.04)', borderRadius: 1 }}><b>{index + 1}.</b> {teamName(match.teamAId)} vs {teamName(match.teamBId)} <Typography component="span" color="text.secondary">· Turno {match.sequence}</Typography></Typography>)}</Stack></Box>
      })}</Stack>}
    </Box>
  </Paper>
}

function MatchCard({ title, subtitle, teams, referee }: { title: string; subtitle: string; teams: string; referee: string }) {
  return <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Typography sx={{ fontWeight: 900 }}>{title}</Typography><Typography color="primary" variant="caption">{subtitle}</Typography><Typography sx={{ my: 1, fontWeight: 750 }}>{teams}</Typography><Typography color="text.secondary" variant="body2">Arbitro: {referee}</Typography></Box>
}

function calendarChecks(tournament: Tournament, referees: Array<{ courtId: string }>) {
  const groups = tournament.groups
  const validGroupIds = new Set(groups.map((group) => group.id))
  const assignedCourtIds = groups.map((group) => group.assignedCourtId).filter((id): id is string => Boolean(id))
  const allTeamsAssigned = tournament.teams.length > 0 && tournament.teams.every((team) => validGroupIds.has(team.groupId))
  const noEmptyGroups = groups.length > 0 && groups.every((group) => tournament.teams.some((team) => team.groupId === group.id))
  const allCourts = groups.length > 0 && assignedCourtIds.length === groups.length
  const uniqueCourts = new Set(assignedCourtIds).size === groups.length
  const configuredCount = tournament.courtsCount == null || tournament.courtsCount === groups.length
  const allReferees = groups.length > 0 && groups.every((group) => referees.filter((referee) => referee.courtId === group.assignedCourtId).length === 1)
  const sizes = groups.map((group) => tournament.teams.filter((team) => team.groupId === group.id).length)
  const matches = sizes.reduce((sum, size) => sum + size * (size - 1) / 2, 0)
  const turns = sizes.length ? Math.max(...sizes.map((size) => size * (size - 1) / 2)) : 0
  const items = [
    { ok: groups.length > 0, label: groups.length ? `${groups.length} gironi disponibili.` : 'Genera prima i gironi.' },
    { ok: allTeamsAssigned && noEmptyGroups, label: allTeamsAssigned && noEmptyGroups ? 'Tutte le squadre sono assegnate e nessun girone è vuoto.' : 'Ogni squadra deve appartenere a un girone non vuoto.' },
    { ok: allCourts, label: allCourts ? 'Ogni girone ha un campo.' : 'Ogni girone deve avere un campo assegnato.' },
    { ok: uniqueCourts && configuredCount, label: uniqueCourts && configuredCount ? 'Il numero di campi corrisponde al numero di gironi.' : 'Il numero di campi deve corrispondere al numero di gironi.' },
    { ok: allReferees, label: allReferees ? 'Ogni campo ha un arbitro.' : 'Ogni campo deve avere un arbitro assegnato.' },
  ]
  return { ready: items.every((item) => item.ok), items, matches, turns, missingReferee: !allReferees }
}

function compareGroups(a: Tournament['groups'][number], b: Tournament['groups'][number]) {
  return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id)
}
