import { useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { getPersistedSetResult } from '../../../domain/live/readiness'
import { useLiveOrchestrationRepository } from '../../../repositories/liveOrchestrationRepository'
import type { Match, Tournament } from '../../../shared/types/domain'

type EditTarget = { match: Match; setNumber: 1 | 2 | 3; scoreA: number; scoreB: number }

export function AdminResults() {
  const { data: tournament } = useAdminWorkspace()
  return <AdminResultsContent tournament={tournament} />
}

export function AdminResultsContent({ tournament }: { tournament: Tournament }) {
  const [groupId, setGroupId] = useState(tournament.groups[0]?.id ?? '')
  const [edit, setEdit] = useState<EditTarget>()
  const [confirming, setConfirming] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [failure, setFailure] = useState(false)
  const live = useLiveOrchestrationRepository(tournament.id)
  const selectedGroupId = tournament.groups.some(group => group.id === groupId) ? groupId : tournament.groups[0]?.id ?? ''
  const matches = tournament.matches.filter(match => match.groupId === selectedGroupId)
    .sort((a, b) => (tournament.rounds?.find(round => round.id === a.roundId)?.sequence ?? 0) - (tournament.rounds?.find(round => round.id === b.roundId)?.sequence ?? 0))
  const run = async (action: () => Promise<unknown>, success: string) => {
    setFeedback('')
    setFailure(false)
    try { await action(); setFeedback(success); return true } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Operazione non riuscita.'); setFailure(true); return false }
  }
  const openEdit = (match: Match, setNumber: 1 | 2 | 3) => {
    const normal = setNumber < 3 ? getPersistedSetResult(tournament, match.id, setNumber as 1 | 2) : undefined
    setEdit({ match, setNumber, scoreA: setNumber === 3 ? match.superTiebreakA ?? 0 : normal?.gamesA ?? 0, scoreB: setNumber === 3 ? match.superTiebreakB ?? 0 : normal?.gamesB ?? 0 })
    setConfirming(false)
    setFeedback('')
    setFailure(false)
  }
  return <Box>
    <Typography variant="h1">RISULTATI</Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Tutte le partite del torneo, aggiornate in tempo reale. La Regia può correggere errori operativi con tracciamento.</Typography>
    <Paper sx={{ mb: 3 }}><Tabs value={selectedGroupId} onChange={(_, value) => setGroupId(value)} variant="scrollable" scrollButtons="auto" aria-label="Gironi risultati">{tournament.groups.map(group => <Tab key={group.id} value={group.id} label={group.name.toUpperCase()} />)}</Tabs></Paper>
    {feedback && <Alert severity={failure ? 'error' : 'success'} sx={{ mb: 2 }}>{feedback}</Alert>}
    {!matches.length && <Alert severity="info">Nessuna partita nel girone selezionato.</Alert>}
    <Stack spacing={1.5}>{matches.map(match => <ResultAccordion key={match.id} tournament={tournament} match={match} onEdit={openEdit} onConfirm={() => void run(() => live.confirmMatchResult(match.id), 'Risultato finale confermato.')} pending={live.isPending} />)}</Stack>
    <Dialog open={Boolean(edit)} onClose={() => { setEdit(undefined); setConfirming(false) }}>
      <DialogTitle>{confirming ? 'CONFERMA CORREZIONE RISULTATO' : `MODIFICA ${edit?.setNumber === 3 ? 'SUPER TIE-BREAK' : `SET ${edit?.setNumber ?? ''}`}`}</DialogTitle>
      <DialogContent>{confirming ? <Typography sx={{ mt: 1 }}>Salvare la correzione {edit?.scoreA}–{edit?.scoreB}? Se il vincitore cambia, la conferma finale e la prontezza del turno saranno ricalcolate.</Typography> : <Stack direction="row" spacing={2} sx={{ mt: 1 }}><TextField type="number" label="Team A" value={edit?.scoreA ?? 0} onChange={event => setEdit(value => value ? { ...value, scoreA: Math.max(0, Number(event.target.value)) } : value)} /><TextField type="number" label="Team B" value={edit?.scoreB ?? 0} onChange={event => setEdit(value => value ? { ...value, scoreB: Math.max(0, Number(event.target.value)) } : value)} /></Stack>}{failure && <Alert severity="error" sx={{ mt: 2 }}>{feedback}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => { setEdit(undefined); setConfirming(false) }}>ANNULLA</Button><Button variant="contained" disabled={live.isPending || edit?.scoreA === edit?.scoreB} onClick={() => { if (!edit) return; if (!confirming) { setConfirming(true); return } const target = edit; void run(() => live.correctMatchResult(target.match.id, target.setNumber, target.scoreA, target.scoreB), 'Correzione salvata. Conferma nuovamente il risultato finale per aggiornare la classifica.').then(saved => { if (saved) { setEdit(undefined); setConfirming(false) } }) }}>{confirming ? 'CONFERMA' : 'SALVA CORREZIONE'}</Button></DialogActions>
    </Dialog>
  </Box>
}

function ResultAccordion({ tournament, match, onEdit, onConfirm, pending }: { tournament: Tournament; match: Match; onEdit: (match: Match, setNumber: 1 | 2 | 3) => void; onConfirm: () => void; pending: boolean }) {
  const teamA = tournament.teams.find(team => team.id === match.teamAId)
  const teamB = tournament.teams.find(team => team.id === match.teamBId)
  const round = tournament.rounds?.find(item => item.id === match.roundId)
  const court = tournament.courts.find(item => item.id === match.courtId)
  const set1 = getPersistedSetResult(tournament, match.id, 1)
  const set2 = getPersistedSetResult(tournament, match.id, 2)
  const needsStb = Boolean(set1 && set2 && ((set1.gamesA > set1.gamesB) !== (set2.gamesA > set2.gamesB)))
  const complete = match.status === 'completed' && Boolean(match.resultConfirmedAt)
  return <Accordion disableGutters>
    <AccordionSummary expandIcon={<ExpandMore />}><Box sx={{ display: 'grid', width: '100%', gap: .5, gridTemplateColumns: { xs: '1fr', md: '110px minmax(0,1fr) auto minmax(0,1fr) 120px' }, alignItems: 'center' }}><b>{round?.name?.toUpperCase() ?? 'TURNO'}</b><span>{teamA?.name ?? 'Team A'}</span><b>{complete ? `${match.score.sets.A}–${match.score.sets.B}` : '—'}</b><span>{teamB?.name ?? 'Team B'}</span><b>{complete ? 'TERMINATA' : 'IN CORSO'}</b></Box></AccordionSummary>
    <AccordionDetails><Stack spacing={2}><Typography><b>{teamA?.name}</b> vs <b>{teamB?.name}</b><br />{court?.name ?? 'Campo'} · {round?.name ?? 'Turno'}<br />Arbitro · Assegnato al campo</Typography>
      <ResultLine label="SET 1" score={set1 ? `${set1.gamesA}–${set1.gamesB}` : 'Mancante'} onEdit={() => onEdit(match, 1)} />
      <ResultLine label="SET 2" score={set2 ? `${set2.gamesA}–${set2.gamesB}` : 'Mancante'} onEdit={() => onEdit(match, 2)} />
      {(needsStb || match.superTiebreakA !== undefined || match.score.currentSet === 3) && <ResultLine label="SUPER TIE-BREAK" score={match.superTiebreakA !== undefined ? `${match.superTiebreakA}–${match.superTiebreakB}` : 'Mancante'} onEdit={() => onEdit(match, 3)} />}
      <Box><Typography variant="overline">STATO PARTITA</Typography><Typography sx={{ fontWeight: 900 }}>{complete ? 'TERMINATA' : match.resultConfirmedAt ? 'CONFERMATA' : 'DA COMPLETARE'}</Typography>{match.resultConfirmedBy && <Typography color="text.secondary">CONFERMATO DA · {match.resultConfirmedBy}</Typography>}</Box>
      {!match.resultConfirmedAt && set1 && set2 && (!needsStb || (match.superTiebreakA !== undefined && match.superTiebreakA !== match.superTiebreakB)) && <Button variant="contained" disabled={pending} onClick={onConfirm}>CONFERMA RISULTATO PARTITA</Button>}
    </Stack></AccordionDetails>
  </Accordion>
}

function ResultLine({ label, score, onEdit }: { label: string; score: string; onEdit: () => void }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 2, alignItems: 'center', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}><b>{label}</b><b>{score}</b><Button size="small" onClick={onEdit}>MODIFICA</Button></Box>
}
