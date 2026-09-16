import { useContext, useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { AuthContext } from '../features/auth/authContext'
import { useAdminWorkspace } from '../features/admin/workspace/useAdminWorkspace'
import { isSupabaseProvider } from '../repositories'
import { useTeamRepository } from '../repositories/teamRepository'
import type { Team } from '../shared/types/domain'
import type { SeedOptions } from './devDataTypes'
import { generateTestTeams, removeTestData, seedTournament } from './tournamentSeeder'
import { installDemoTestData } from './demoTestData'
import { compositionOf, DEV_TEST_TEAM_PASSWORD, seedSessions, seedSupabaseTestData, testCredentialsCsv, type SeedResult } from './supabaseTestSeeder'

export default function TestDataPanel() {
  const auth = useContext(AuthContext)
  const { entry, data: tournament } = useAdminWorkspace()
  const repository = useTeamRepository()
  const [dialog, setDialog] = useState<'generate' | 'seed' | 'remove' | 'reset' | null>(null)
  const [mode, setMode] = useState<SeedOptions['mode']>('random')
  const [filter, setFilter] = useState<SeedOptions['filter']>('all')
  const [seed, setSeed] = useState(tournament.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<SeedResult[]>(seedSessions.get(tournament.id) ?? [])
  const [inspected, setInspected] = useState<string | null>(null)
  const remote = isSupabaseProvider()
  // TODO: restrict/remove before production release
  if (auth?.status !== 'authenticated' || auth.profile?.role !== 'admin') return null
  if (!entry) return <Paper variant="outlined" sx={{ p: 3, borderColor: 'warning.main' }}>
    <Chip label="TESTING TOOL" color="warning" size="small" />
    <Typography variant="h2">TEST DATA</Typography>
    <Typography>Available dataset: 99 players / 33 teams</Typography>
    <Alert severity="info" sx={{ my: 2 }}>Select or create a tournament first.</Alert>
    <Button variant="contained" disabled>GENERATE TEST TEAMS</Button>
  </Paper>
  const count = entry.config.teamsCount
  const manualCount = remote ? tournament.teams.filter(team => !results.some(row => row.teamId === team.id)).length : tournament.teams.filter(team => !team.isTestData).length
  const needed = count - manualCount
  const locked = entry.config.started || ['live', 'completed'].includes(entry.config.status)
  const rows: SeedResult[] = remote ? results : tournament.teams.filter(team => team.isTestData).map(template => ({ template, teamId: template.id, username: '', status: 'created' }))
  const selected = rows.find(row => (row.teamId ?? row.template.id) === inspected)
  const selectedTeam = selected && (tournament.teams.find(team => team.id === selected.teamId) ?? selected.template)
  const options: SeedOptions = { tournamentId: tournament.id, count, mode, seed, filter }
  const validation = count > 33 ? 'Test dataset supports a maximum of 33 teams.' : needed < 0 ? 'Manual teams exceed the configured count.' : filter && ['male', 'female', 'mixed'].includes(filter) && needed > 11 ? 'Selected filter supports only 11 teams.' : ''
  const canRetry = remote && results.some(row => row.status !== 'active')
  const batchStarted = results.some(row => row.creationAttempted || row.teamId)
  const generationBlocked = busy || locked || count > 33 || needed < 0 || (remote && batchStarted)

  async function execute() {
    if (!entry || busy || locked) return
    setBusy(true); setError('')
    try {
      if (dialog === 'generate') {
        if (remote) {
          if (batchStarted) throw new Error('Finish or inspect the existing Supabase batch before generating another.')
          const pending = generateTestTeams({ ...options, count: needed }).map(template => ({ template, username: '', status: 'pending' as const }))
          if (validation) throw new Error(validation)
          if (pending.some(row => tournament.teams.some(team => team.name.toLowerCase() === row.template.name.toLowerCase()))) throw new Error('A team with the selected test name already exists. Choose another seed.')
          seedSessions.set(tournament.id, pending)
          setResults(pending)

        } else installDemoTestData({ ...entry, domain: tournament }, seedTournament(tournament, options))
      } else if (dialog === 'seed' && remote) {
        if (entry.local) throw new Error('Select a persisted Supabase tournament first.')
        if (count > 33 || results.length + manualCount > count) throw new Error('The staged batch exceeds the current tournament configuration. Regenerate before seeding.')
        await seedSupabaseTestData(tournament.id, results, repository, setResults)
      } else if (!remote) installDemoTestData({ ...entry, domain: tournament }, removeTestData(tournament))
      setDialog(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossibile generare i dati di test.') }
    finally { setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([testCredentialsCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${tournament.id}-test-credentials.csv`; anchor.click(); URL.revokeObjectURL(url)
  }
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderColor: 'warning.main' }}>
    <Chip label="TESTING TOOL" color="warning" size="small" />
    <Typography variant="h2">TEST DATA</Typography>
    <Typography>Available dataset: 99 players / 33 teams</Typography>
    <Typography>Torneo attuale: {tournament.name}</Typography>
    <Typography>Squadre richieste dal torneo: {count} teams</Typography>
    <Typography>Mock dataset: 33 teams</Typography>
    <Alert severity="warning" sx={{ my: 2 }}>{remote ? 'Explicit development seeding only. Supabase has no persisted test marker: selective removal is manual. The broad tournament cleanup is never called. Keep this panel open during seeding; results are tracked for this browser session only.' : 'Test rosters use the normal demo provider and its local persistence. Manual teams are preserved. Demo accounts are not Supabase login accounts.'}</Alert>
    {locked && <Alert severity="info">Test roster changes are locked after tournament start.</Alert>}
    {validation && <Alert severity="error">{validation}</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ my: 2 }}>
      <Button variant="contained" color="warning" disabled={generationBlocked} onClick={() => { setError(''); setDialog('generate') }}>GENERATE TEST TEAMS</Button>
      {remote && rows.length > 0 && <Button variant="outlined" disabled={busy || locked || entry.local || !canRetry || count > 33 || results.length + manualCount > count} onClick={() => { setError(''); setDialog('seed') }}>SEED TEST DATA TO SUPABASE</Button>}
      <Button disabled={remote || busy || locked || !rows.length} onClick={() => setDialog('remove')}>REMOVE TEST TEAMS</Button>
      <Button disabled={remote || busy || locked || !rows.length} onClick={() => setDialog('reset')}>RESET TOURNAMENT TEST DATA</Button>
    </Stack>
    {remote && rows.length > 0 && <Alert severity="info">{rows.length} squadre di test generate per questo torneo. Le squadre in attesa sono una anteprima locale finché non confermi SALVA DATI DI TEST SU SUPABASE.{entry.local && " Seleziona un torneo Supabase salvato per abilitare il salvataggio nel database."}</Alert>}
    <Typography>{rows.filter(row => row.teamId).length} test teams / {rows.filter(row => row.teamId).length * 3} players / {rows.filter(row => row.status === 'active').length} login accounts</Typography>
    {rows.some(row => row.status === 'active') && <><Alert severity="warning">DEV TEST PASSWORD: {DEV_TEST_TEAM_PASSWORD}</Alert><Button onClick={download}>DOWNLOAD TEST CREDENTIALS CSV</Button></>}
    {!!rows.length && <TableContainer><Table size="small" aria-label="Squadre di test generate"><TableHead><TableRow>{['Squadra', 'Composizione', 'Giocatori', 'Nome utente', 'Stato'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row => <TableRow key={row.template.id}>
      <TableCell><Button onClick={() => setInspected(row.teamId ?? row.template.id)}>{row.template.name}</Button></TableCell><TableCell>{compositionOf(row.template)}</TableCell><TableCell>{row.template.players.map(player => player.name).join(' / ')}</TableCell><TableCell>{row.username || 'Nessun account'}</TableCell><TableCell>{remote ? row.status.toUpperCase() : 'SOLO DEMO'}{row.error && <Typography color="error">{row.error}</Typography>}</TableCell>
    </TableRow>)}</TableBody></Table></TableContainer>}
    <Dialog open={dialog !== null} onClose={() => { if (!busy) setDialog(null) }} fullWidth maxWidth="sm">
      <DialogTitle>{dialog === 'seed' ? 'SEED TEST DATA TO SUPABASE' : dialog === 'generate' ? 'GENERATE TEST TEAMS' : dialog === 'remove' ? 'REMOVE TEST TEAMS' : 'RESET TOURNAMENT TEST DATA'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Torneo: {tournament.name}</Typography>
        {dialog === 'generate' || dialog === 'seed' ? <>
          <Typography>Squadre richieste: {count}. Squadre simulate disponibili: 33. {manualCount} squadre manuali mantenute; {Math.max(0, needed)} squadre di test da generare.</Typography>
          {!!tournament.teams.length && <Alert severity="warning">This tournament already contains {tournament.teams.length} teams. Generating test data may add or replace test teams. Manual teams are never removed.{remote && ' Supabase replacement is unavailable; only additions or retries are supported.'}</Alert>}
          {dialog === 'seed' && <Alert severity="warning">Crea squadre, giocatori e account reali nel torneo selezionato. DEV TEST PASSWORD: {DEV_TEST_TEAM_PASSWORD}. Nessun annullamento o pulizia automatica.</Alert>}
          {dialog === 'seed' ? <Alert severity="info">Salva il lotto generato. Le squadre esistenti vengono riutilizzate e gli account già creati vengono ignorati.</Alert> : <>
            <TextField select label="Mode" value={mode} onChange={event => setMode(event.target.value as SeedOptions['mode'])}>{['random', 'deterministic'].map(value => <MenuItem key={value} value={value}>{value.toUpperCase()}</MenuItem>)}</TextField>
            {mode === 'deterministic' && <TextField label="Seed" value={seed} onChange={event => setSeed(event.target.value)} />}
            <TextField select label="Composition filter" value={filter} onChange={event => setFilter(event.target.value as SeedOptions['filter'])}>{['all', 'male', 'female', 'mixed', 'balanced'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          </>}
          {validation && dialog === 'generate' && <Alert severity="error">{validation}</Alert>}
        </> : <Alert severity="warning">Remove generated teams, their players and dependent demo matches, events, cards and reports from this tournament? Manual teams and unrelated data are preserved.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setDialog(null)}>CANCEL</Button><Button color="warning" variant="contained" disabled={busy || locked || (dialog === 'generate' && !!validation)} onClick={() => void execute()}>{busy ? 'WORKING...' : dialog === 'seed' ? 'CONFIRM SUPABASE SEED' : dialog === 'generate' ? tournament.teams.length || rows.length ? 'REPLACE TEST TEAMS' : `GENERATE ${Math.max(0, needed)} TEAMS` : 'CONFIRM REMOVAL'}</Button></DialogActions>
    </Dialog>
    <Dialog open={!!selectedTeam} onClose={() => setInspected(null)} fullWidth maxWidth="md"><DialogTitle>CONTROLLO SQUADRA DI TEST</DialogTitle><DialogContent>{selectedTeam && selected && <Inspector team={selectedTeam} row={selected} remote={remote} />}</DialogContent><DialogActions><Button onClick={() => setInspected(null)}>Chiudi</Button></DialogActions></Dialog>
  </Paper>
}

function Inspector({ team, row, remote }: { team: Team; row: SeedResult; remote: boolean }) {
  const { data } = useAdminWorkspace()
  const matches = data.matches.filter(match => match.teamAId === team.id || match.teamBId === team.id)
  const current = matches.find(match => !['scheduled', 'completed'].includes(match.status)) ?? matches.find(match => match.status === 'scheduled')
  const cards = data.teamCards.filter(card => card.teamId === team.id)
  const lineups = current?.lineups.filter(lineup => lineup.teamId === team.id) ?? []
  return <Stack spacing={2}>
    <Typography variant="h3">{team.name} / {compositionOf(team)}</Typography>
    <Box>{team.players.map(player => <Typography key={player.id}>{player.name} / {player.gender}</Typography>)}</Box>
    <Typography>AUTH: {row.username || 'Nessun account'} / {remote ? row.status : 'SOLO DEMO'}</Typography>
    <Typography>GROUP: {data.groups.find(group => group.id === team.groupId)?.name ?? 'Not assigned'}</Typography>
    <Typography>CURRENT / NEXT MATCH: {current ? `${data.teams.find(item => item.id === current.teamAId)?.name} vs ${data.teams.find(item => item.id === current.teamBId)?.name} / ${current.status}` : 'Not scheduled'}</Typography>
    <Typography>GOLD / SILVER: La qualificazione viene calcolata nella configurazione torneo; non è disponibile alcuna assegnazione salvata al tabellone.</Typography>
    <Typography>CARDS: {cards.map(card => `${data.cards.find(item => item.id === card.cardId)?.name ?? card.cardId} (${card.state})`).join(', ') || 'None assigned'}</Typography>
    <Typography>LINEUP: {lineups.map(lineup => `Set ${lineup.setNumber}: ${lineup.activePlayerIds.map(id => team.players.find(player => player.id === id)?.name ?? id).join(' / ')}; bench: ${team.players.find(player => player.id === lineup.benchPlayerId)?.name}`).join(' | ') || 'Not confirmed'}</Typography>
  </Stack>
}
