import { useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import Casino from '@mui/icons-material/Casino'
import { motion } from 'framer-motion'
import { useWorkspaceStore, type WorkspaceEntry } from '../workspace/workspaceStore'

export function OperationsControls({ entry, roundId, roundName }: { entry: WorkspaceEntry; roundId?: string; roundName?: string }) {
  const state = useWorkspaceStore()
  const [confirmDice, setConfirmDice] = useState(false)
  const [eventId, setEventId] = useState('')
  const events = state.events.filter(event => entry.activeEvents.includes(event.id))
  const selectedId = events.some(event => event.id === eventId) ? eventId : events[0]?.id ?? ''
  const active = entry.launchedEvent && !entry.launchedEvent.endedAt ? entry.launchedEvent : undefined
  const sourceRound = entry.domain.rounds?.find(round => round.id === roundId)
  const dice = entry.dice?.roundId === roundId ? entry.dice : sourceRound?.diceResult ? { value: sourceRound.diceResult, rolledAt: sourceRound.diceStartedAt } : undefined
  return <Stack spacing={3}>
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
