import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material'
import { useWorkspaceStore, validateConfig, type WorkspaceEntry } from '../workspace/workspaceStore'

export function TournamentLifecycle({ entry }: { entry: WorkspaceEntry }) {
  const transition = useWorkspaceStore(state => state.transition)
  const [action, setAction] = useState<'start' | 'complete' | 'delete' | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const invalid = validateConfig(entry.config)
  const text = action === 'start' ? 'Avvia torneo' : action === 'complete' ? 'Completa torneo' : 'Elimina torneo'
  return <Stack spacing={2}>
    {invalid.length > 0 && <Alert severity="warning">{invalid.join(' ')}</Alert>}
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {entry.config.status === 'draft' && <Button variant="outlined" disabled={Boolean(invalid.length)} onClick={() => transition(entry, 'ready')}>Segna come pronto</Button>}
      {['draft', 'ready'].includes(entry.config.status) && <Button variant="contained" disabled={Boolean(invalid.length)} onClick={() => { setError(''); setAction('start') }}>AVVIA TORNEO</Button>}
      {entry.config.status === 'live' && <Button variant="contained" onClick={() => { setError(''); setAction('complete') }}>COMPLETA TORNEO</Button>}
      {entry.config.status === 'completed' && <Button variant="outlined" color="error" onClick={() => { setError(''); setConfirmation(''); setAction('delete') }}>ELIMINA TORNEO</Button>}
    </Stack>
    <Dialog open={action !== null} onClose={() => setAction(null)} maxWidth="sm" fullWidth>
      <DialogTitle>{text}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{action === 'start' ? "L'avvio blocca la struttura e le squadre. Questa azione aggiorna la sessione." : action === 'complete' ? 'Completare il torneo e terminare gli eventi speciali attivi?' : 'Rimuovere questo torneo e i relativi report dalla sessione? Le librerie globali resteranno disponibili.'}</DialogContentText>
        {action === 'delete' && <TextField fullWidth label={`Scrivi DELETE ${entry.config.name}`} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoFocus />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setAction(null)}>Annulla</Button><Button color={action === 'delete' ? 'error' : 'primary'} variant="contained" disabled={action === 'delete' && confirmation !== `DELETE ${entry.config.name}`} onClick={() => {
        if (action && transition(entry, action, confirmation)) setAction(null)
        else setError('Lo stato del torneo è cambiato. Controlla la configurazione e riprova.')
      }}>Conferma {text}</Button></DialogActions>
    </Dialog>
  </Stack>
}
