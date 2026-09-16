import { useState } from 'react'
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { useGroupManagement } from '../../../repositories/groupRepository'
import { calculateGroupDistribution } from '../../../domain/tournament/groupEngine'
import { generateGroups, type GroupMode } from '../../../domain/tournament/groupGeneration'

export function GroupSetup() {
  const management = useGroupManagement()
  return <GroupSetupContent key={management.data.id} management={management} />
}
export function GroupSetupContent({ management }: { management: ReturnType<typeof useGroupManagement> }) {
  const { data: tournament, entry, remote } = management
  const [mode, setMode] = useState<GroupMode>('seeded')
  const [preferred, setPreferred] = useState(tournament.teamsPerGroup ?? (!remote ? entry?.config.teamsPerGroup : null) ?? 5)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const editable = ['draft','configured'].includes(tournament.status ?? '')
  const expected = remote ? tournament.teamsCount : entry?.config.teamsCount
  let sizes: number[] = [], validation = ''
  try {
    if (expected != null && expected !== tournament.teams.length) throw new Error(`Il torneo è configurato per ${expected} squadre, ma ne risultano registrate ${tournament.teams.length}.`)
    sizes = calculateGroupDistribution(tournament.teams.length, preferred).groupSizes
  } catch (cause) { validation = cause instanceof Error ? cause.message : 'Configurazione non valida.' }
  const counts = tournament.groups.map(g => tournament.teams.filter(t => t.groupId === g.id).length)
  const courts = tournament.courtsCount ?? entry?.config.courtsCount ?? tournament.courts.length
  async function execute(action: () => Promise<void>) {
    setPending(true); setError(''); setMessage('')
    try { await action(); setMessage('Gironi aggiornati.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossibile aggiornare i gironi.') }
    finally { setPending(false) }
  }
  function generate() {
    if (!editable || validation) return
    if (tournament.groups.length && !window.confirm('Rigenerando i gironi perderai le modifiche manuali effettuate finora. Vuoi continuare?')) return
    void execute(async () => management.replace(generateGroups(tournament.teams, sizes, mode)))
  }
  if (management.isLoading) return <Typography>Caricamento gironi…</Typography>
  return <Stack spacing={3}>
    <Typography variant="h2">Gironi</Typography>
    {!editable && <Alert severity="info">I gironi sono in sola lettura dopo l’avvio del torneo.</Alert>}
    {management.error && <Alert severity="error">{management.error}</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField select label="Modalità" value={mode} disabled={!editable || pending} onChange={e => setMode(e.target.value as GroupMode)} sx={{ minWidth: 180 }}><MenuItem value="seeded">Teste di serie</MenuItem><MenuItem value="random">Casuale</MenuItem></TextField>
      <TextField label="Squadre per girone" type="number" value={preferred || ''} disabled={!editable || pending} onChange={e => setPreferred(Number(e.target.value))} slotProps={{ htmlInput: { min: 2, step: 1 } }} />
    </Stack>
    {validation ? <Alert severity="warning">{validation}</Alert> : <Typography>{tournament.teams.length} squadre · {sizes.length} gironi previsti ({sizes.join(' / ')}) · {courts} campi configurati</Typography>}
    {sizes.length > 0 && sizes.length !== courts && <Alert severity="info">Sono previsti {sizes.length} gironi ma il torneo ha {courts} campi configurati. Puoi comunque generare i gironi.</Alert>}
    <Button variant="contained" disabled={!editable || pending || !!validation || !!management.error} onClick={generate}>{pending ? 'Salvataggio…' : tournament.groups.length ? 'Rigenera gironi' : 'Genera gironi'}</Button>
    {counts.length > 0 && Math.max(...counts)-Math.min(...counts) > 1 && <Alert severity="warning">I gironi non sono più bilanciati.</Alert>}
    {!tournament.groups.length && <Typography>Gironi non ancora generati</Typography>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
      {[...tournament.groups, ...(tournament.teams.some(t => !tournament.groups.some(g => g.id === t.groupId)) ? [{ id: '', name: 'Squadre senza girone' }] : [])].map(group => {
        const teams = tournament.teams.filter(t => group.id ? t.groupId === group.id : !tournament.groups.some(g => g.id === t.groupId))
        return <Paper key={group.id} sx={{ p: 3 }}><Typography variant="h3" sx={{ mb: 2 }}>{group.name} · {teams.length} squadre</Typography><Stack spacing={2}>{teams.map(team => <Stack key={team.id} spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>{team.name}{team.ranking != null ? ` · Ranking ${team.ranking}` : ''}</Typography>
          <TextField select label={`Girone di ${team.name}`} value={group.id} disabled={!editable || pending || !tournament.groups.length} onChange={e => void execute(() => management.move(team.id, e.target.value))}>
            {!group.id && <MenuItem value="" disabled>Da assegnare</MenuItem>}{tournament.groups.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
          </TextField>
        </Stack>)}</Stack></Paper>
      })}
    </Box>
  </Stack>
}
