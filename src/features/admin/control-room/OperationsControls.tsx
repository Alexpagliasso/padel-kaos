import { useState } from 'react'
import { Alert, Box, Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import Casino from '@mui/icons-material/Casino'
import { motion } from 'framer-motion'
import { useWorkspaceStore, type WorkspaceEntry } from '../workspace/workspaceStore'
import type { Match, Tournament } from '../../../shared/types/domain'
import { defaultCardsPerTeam, normalizeCardsPerTeam, useLiveOrchestrationRepository, type SetAction, type SetControlMode } from '../../../repositories/liveOrchestrationRepository'
import { dataProvider } from '../../../repositories'

export function OperationsControls({ entry, tournament, matches, roundId, roundName }: { entry: WorkspaceEntry; tournament: Tournament; matches: Match[]; roundId?: string; roundName?: string }) {
  const state = useWorkspaceStore()
  const [confirmDice, setConfirmDice] = useState(false)
  const [eventId, setEventId] = useState('')
  const [cardsPerTeam, setCardsPerTeam] = useState(defaultCardsPerTeam)
  const [liveFeedback, setLiveFeedback] = useState('')
  const live = useLiveOrchestrationRepository(tournament.id)
  const events = state.events.filter(event => entry.activeEvents.includes(event.id))
  const selectedId = events.some(event => event.id === eventId) ? eventId : events[0]?.id ?? ''
  const active = entry.launchedEvent && !entry.launchedEvent.endedAt ? entry.launchedEvent : undefined
  const sourceRound = entry.domain.rounds?.find(round => round.id === roundId)
  const dice = entry.dice?.roundId === roundId ? entry.dice : sourceRound?.diceResult ? { value: sourceRound.diceResult, rolledAt: sourceRound.diceStartedAt } : undefined
  const mode = tournament.setControlMode ?? 'centralized'
  const matchIds = new Set(matches.map(match => match.id))
  const assignedCardCount = tournament.teamCards.filter(card => card.matchId && matchIds.has(card.matchId)).length
  const cardsAssigned = matches.length > 0 && assignedCardCount > 0
  const missingLineups = (setNumber: 1 | 2) => matches.flatMap(match => [match.teamAId, match.teamBId]
    .filter(teamId => !match.lineups.some(lineup => lineup.teamId === teamId && lineup.setNumber === setNumber))
    .map(teamId => ({ court: tournament.courts.find(court => court.id === match.courtId)?.name ?? 'Campo', team: tournament.teams.find(team => team.id === teamId)?.name ?? 'Squadra' })))
  const run = async (operation: () => Promise<unknown>, success: string) => {
    setLiveFeedback('')
    try { await operation(); setLiveFeedback(success) } catch (cause) { setLiveFeedback(cause instanceof Error ? cause.message : 'Operazione non riuscita.') }
  }
  const changeMode = (next: SetControlMode) => void run(() => live.setMode(next), 'Modalità di gestione aggiornata.')
  const drawCards = (redraw: boolean) => {
    if (!roundId) return
    if (redraw && !window.confirm('Le carte già assegnate per questo turno verranno sostituite. Continuare?')) return
    void run(() => live.assignCards(roundId, cardsPerTeam, redraw), redraw ? 'Carte riassegnate.' : 'Carte assegnate.')
  }
  const control = (action: SetAction, success: string) => roundId && void run(() => live.controlRound(roundId, action), success)
  const generateMissingLineups = () => {
    if (!roundId) return
    setLiveFeedback('')
    void live.generateMissingLineups(roundId).then(result => {
      const generated = typeof result === 'object' && result !== null && 'generated' in result ? Number(result.generated) : 0
      setLiveFeedback(generated > 0 ? `${generated} formazioni mancanti generate.` : 'Tutte le formazioni richieste sono già presenti.')
    }).catch(cause => setLiveFeedback(cause instanceof Error ? cause.message : 'Operazione non riuscita.'))
  }
  return <Stack spacing={3}>
    <Paper sx={{ p: 3 }}>
      <Typography variant="h3">Orchestrazione turno</Typography>
      <Typography color="text.secondary" sx={{ my: 1 }}>{roundName ?? 'Nessun turno configurato'}</Typography>
      {dataProvider !== 'supabase' && <Alert severity="info" sx={{ mb: 2 }}>Controlli persistiti disponibili con Supabase.</Alert>}
      <Typography sx={{ fontWeight: 800, mb: 1 }}>Gestione inizio e fine set</Typography>
      <ButtonGroup fullWidth sx={{ mb: 3 }}>
        <Button variant={mode === 'centralized' ? 'contained' : 'outlined'} disabled={live.isPending || dataProvider !== 'supabase'} onClick={() => changeMode('centralized')}>Regia centralizzata</Button>
        <Button variant={mode === 'referee' ? 'contained' : 'outlined'} disabled={live.isPending || dataProvider !== 'supabase'} onClick={() => changeMode('referee')}>Gestione arbitri</Button>
      </ButtonGroup>
      <TextField type="number" fullWidth label="Carte per squadra" value={cardsPerTeam} slotProps={{ htmlInput: { min: 1, max: 10 } }} onChange={event => setCardsPerTeam(normalizeCardsPerTeam(Number(event.target.value)))} />
      <Button fullWidth variant="contained" sx={{ mt: 2 }} disabled={!roundId || live.isPending || dataProvider !== 'supabase'} onClick={() => drawCards(cardsAssigned)}>{cardsAssigned ? 'RIASSEGNA CARTE' : 'ASSEGNA CARTE'}</Button>
      <Typography color={cardsAssigned ? 'success.main' : 'warning.main'} sx={{ mt: 1, fontWeight: 800 }}>{cardsAssigned ? `Carte assegnate · ${assignedCardCount}` : 'Carte da assegnare'}</Typography>
      <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'warning.main', borderRadius: 2 }}>
        <Typography color="warning.main" sx={{ fontSize: 12, fontWeight: 900, mb: 1 }}>STRUMENTO TEST/ASSISTENZA</Typography>
        <Button fullWidth variant="outlined" color="warning" disabled={!roundId || live.isPending || dataProvider !== 'supabase'} onClick={generateMissingLineups}>GENERA FORMAZIONI MANCANTI</Button>
      </Box>
      {mode === 'centralized' ? <Stack spacing={1.25} sx={{ mt: 3 }}>
        <Button variant="contained" disabled={!roundId || live.isPending || matches.some(match => !['scheduled','ready'].includes(match.status))} onClick={() => control('start_set_1', 'Set 1 avviato.')}>AVVIA SET 1</Button>
        <Button variant="outlined" disabled={!roundId || live.isPending || matches.some(match => match.status !== 'live_set_1')} onClick={() => control('end_set_1', 'Set 1 terminato.')}>TERMINA SET 1</Button>
        <Button variant="contained" disabled={!roundId || live.isPending || matches.some(match => match.status !== 'set_break')} onClick={() => control('start_set_2', 'Set 2 avviato.')}>AVVIA SET 2</Button>
        <Button variant="outlined" disabled={!roundId || live.isPending || matches.some(match => match.status !== 'live_set_2')} onClick={() => control('end_set_2', 'Set 2 terminato.')}>TERMINA SET 2</Button>
        {missingLineups(matches.some(match => match.status === 'set_break') ? 2 : 1).map(item => <Alert key={`${item.court}-${item.team}`} severity="warning">{item.court}: Formazione mancante — {item.team}</Alert>)}
      </Stack> : <Button fullWidth variant="contained" sx={{ mt: 3 }} disabled={!roundId || Boolean(sourceRound?.openedAt) || live.isPending} onClick={() => roundId && void run(() => live.openRound(roundId), 'Turno aperto agli arbitri.')}>APRI TURNO</Button>}
      {(liveFeedback || live.error) && <Alert severity={(liveFeedback || live.error).includes('non') || (liveFeedback || live.error).includes('Impossibile') ? 'error' : 'success'} sx={{ mt: 2 }}>{liveFeedback || live.error}</Alert>}
    </Paper>
    <Paper sx={{ p: 3, background: 'var(--event-gradient)' }}>
      <Typography variant="h3">Dado globale</Typography><Typography color="text.secondary" sx={{ my: 1 }}>{roundName ?? 'Nessun turno configurato'}</Typography>
      <Box component={motion.div} key={dice?.rolledAt ?? 'waiting'} initial={{ rotate: -25, scale: .75 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: .25 }} sx={{ py: 3, textAlign: 'center', fontSize: 88, fontWeight: 900, color: 'primary.main' }}>{dice?.value ?? <Casino sx={{ fontSize: 88 }} />}</Box>
      <Typography sx={{ mb: 2 }}>{dice ? `Dado globale attuale: ${dice.value}` : 'Dado globale / Non lanciato'}</Typography>
      <Button fullWidth startIcon={<Casino />} variant="contained" sx={{ minHeight: 80, fontSize: 18 }} disabled={!roundId || entry.config.status !== 'live'} onClick={() => setConfirmDice(true)}>LANCIA IL DADO GLOBALE</Button>
      {entry.config.status !== 'live' && <Typography color="text.secondary" sx={{ mt: 1, fontSize: 13 }}>Available when the tournament is live.</Typography>}
    </Paper>
    <Paper sx={{ p: 3 }}><Typography variant="h3" sx={{ mb: 3 }}>SPECIAL EVENT</Typography>
      {events.length ? <TextField select fullWidth label="Eventi attivi del torneo" value={selectedId} onChange={event => setEventId(event.target.value)}>{events.map(event => <MenuItem key={event.id} value={event.id}>{event.name}</MenuItem>)}</TextField> : <Alert severity="info">Nessun evento attivo. Scegli gli eventi nella configurazione torneo.</Alert>}
      <Button sx={{ mt: 2 }} fullWidth variant="contained" disabled={!selectedId || Boolean(active) || entry.config.status === 'completed'} onClick={() => state.launchEvent(entry, selectedId)}>LAUNCH EVENT</Button>
      {active && <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'primary.main', borderRadius: 2, background: 'var(--event-soft)' }}><Typography color="primary" sx={{ fontSize: 12, fontWeight: 900 }}>ACTIVE EVENT</Typography><Typography variant="h3" sx={{ mt: 1 }}>{active.definition.name}</Typography><Typography sx={{ my: 1 }}>{active.definition.description}</Typography>{active.definition.prize && <Typography sx={{ fontWeight: 800 }}>{active.definition.prize}</Typography>}<Button fullWidth color="warning" variant="outlined" sx={{ mt: 2 }} onClick={() => state.endEvent(entry)}>END EVENT</Button></Box>}
      {entry.launchedEvent?.endedAt && <Alert severity="success" sx={{ mt: 2 }}>Event ended / {entry.launchedEvent.definition.name}</Alert>}
    </Paper>
    <Dialog open={confirmDice} onClose={() => setConfirmDice(false)}><DialogTitle>Lanciare il dado globale?</DialogTitle><DialogContent>{dice ? 'Sostituisci il risultato attuale' : 'Mostra il risultato del dado globale'} for {roundName}. Questa è una anteprima operativa.</DialogContent><DialogActions><Button onClick={() => setConfirmDice(false)}>Annulla</Button><Button variant="contained" onClick={() => { if (roundId) state.rollDice(entry, roundId); setConfirmDice(false) }}>Conferma lancio</Button></DialogActions></Dialog>
  </Stack>
}
