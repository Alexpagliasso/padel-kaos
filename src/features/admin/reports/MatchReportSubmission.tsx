import { useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import type { Match, Tournament } from '../../../shared/types/domain'
import type { DemoEvent } from '../../../demo/demoTypes'
import { useWorkspaceStore, type ReportSet } from '../workspace/workspaceStore'
import { buildMatchReport, validateReportSets } from './matchReport'

export function MatchReportSubmission({ tournament, match, referee, events = [] }: { tournament: Tournament; match: Match; referee: string; events?: DemoEvent[] }) {
  const state = useWorkspaceStore()
  const existing = state.reports.find(report => report.id === `${tournament.id}:${match.id}`)
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<ReportSet[]>([{ number: 1, a: 0, b: 0 }, { number: 2, a: 0, b: 0 }])
  const [error, setError] = useState('')
  const canSubmit = match.status === 'completed' && (!existing || existing.status === 'review')
  return <Paper sx={{ p: 3 }}>
    <Typography variant="h3">Final match report / Distinta</Typography>
    {existing ? <Alert severity={existing.status === 'review' ? 'warning' : 'success'} sx={{ my: 2 }}>{existing.status === 'approved' ? 'Risultato approvato' : existing.status === 'review' ? `Revisione richiesta: ${existing.reviewNote}` : 'Report inviato alla Regia'}</Alert> : <Typography color="text.secondary" sx={{ my: 2 }}>Completa la partita, conferma i risultati finali dei set e invia il report.</Typography>}
    <Button variant="contained" disabled={!canSubmit} onClick={() => { setSets(existing?.sets.map(set => ({ ...set })) ?? [{ number: 1, a: 0, b: 0 }, { number: 2, a: 0, b: 0 }]); setError(''); setOpen(true) }}>Submit final match report</Button>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Final match report</DialogTitle><DialogContent>
      <Typography sx={{ fontWeight: 850, mb: 2 }}>{tournament.teams.find(team => team.id === match.teamAId)?.name} vs {tournament.teams.find(team => team.id === match.teamBId)?.name}</Typography>
      <Alert severity="info" sx={{ mb: 3 }}>Enter the final results of each played set. Lineups and recorded card/prize activity are included automatically.</Alert>
      <Stack spacing={2}>{sets.map((set, index) => <Box key={set.number} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>{(['a', 'b'] as const).map(side => <TextField key={side} type="number" label={`${set.number === 3 ? 'Super Tie-Break' : `Set ${set.number}`} ${side.toUpperCase()}`} value={Number.isNaN(set[side]) ? '' : set[side]} slotProps={{ htmlInput: { min: 0, step: 1 } }} onChange={event => setSets(current => current.map((row, i) => i === index ? { ...row, [side]: event.target.value === '' ? NaN : Number(event.target.value) } : row))} />)}</Box>)}</Stack>
      <FormControlLabel sx={{ my: 2 }} label="Super Tie-Break played" control={<Switch checked={sets.length === 3} onChange={(_, checked) => setSets(current => checked ? [...current.slice(0, 2), { number: 3, a: 0, b: 0 }] : current.slice(0, 2))} />} />
      <Typography>Referee / {referee}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Annulla</Button><Button variant="contained" onClick={() => { const reason = validateReportSets(sets); if (reason) { setError(reason); return } state.submitReport(buildMatchReport(tournament, match, sets, referee, events)); setOpen(false) }}>Invia report partita</Button></DialogActions></Dialog>
  </Paper>
}
