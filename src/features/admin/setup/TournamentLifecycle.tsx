import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material'
import { useWorkspaceStore, validateConfig, type WorkspaceEntry } from '../workspace/workspaceStore'

export function TournamentLifecycle({ entry, onDelete }: { entry: WorkspaceEntry; onDelete?: (entry: WorkspaceEntry) => Promise<void> }) {
  const transition = useWorkspaceStore(state => state.transition)
  const [action, setAction] = useState<'start' | 'complete' | 'delete' | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const invalid = validateConfig(entry.config)
  const text = action === 'start' ? 'Avvia torneo' : action === 'complete' ? 'Completa torneo' : 'Elimina torneo'

  async function confirm() {
    if (!action) return
    if (action === 'delete' && onDelete) {
      setDeleting(true)
      try { await onDelete(entry); setAction(null) }
      catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Impossibile eliminare il torneo.') }
      finally { setDeleting(false) }
    } else if (transition(entry, action, confirmation)) setAction(null)
    else setError('Lo stato del torneo è cambiato. Controlla la configurazione e riprova.')
  }

  return <Stack spacing={2}>
    {invalid.length > 0 && <Alert severity="warning">{invalid.join(' ')}</Alert>}
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {entry.config.status === 'draft' && <Button variant="outlined" disabled={Boolean(invalid.length)} onClick={() => transition(entry, 'ready')}>Segna come pronto</Button>}
      {['draft', 'ready'].includes(entry.config.status) && <Button variant="contained" disabled={Boolean(invalid.length)} onClick={() => { setError(''); setAction('start') }}>AVVIA TORNEO</Button>}
      {entry.config.status === 'live' && <Button variant="contained" onClick={() => { setError(''); setAction('complete') }}>COMPLETA TORNEO</Button>}
    </Stack>
    {['draft', 'ready'].includes(entry.config.status) && !entry.config.started && <Stack spacing={1} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
      <p className="text-xs font-black uppercase text-white/45">Zona pericolosa</p>
      <Button variant="outlined" color="error" sx={{ alignSelf: 'flex-start' }} onClick={() => { setError(''); setConfirmation(''); setAction('delete') }}>ELIMINA TORNEO</Button>
    </Stack>}
    <Dialog open={action !== null} onClose={() => { if (!deleting) setAction(null) }} maxWidth="sm" fullWidth>
      <DialogTitle>{text}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{action === 'start' ? "L'avvio blocca la struttura e le squadre. Questa azione aggiorna la sessione." : action === 'complete' ? 'Completare il torneo e terminare gli eventi speciali attivi?' : 'I dati del torneo e gli account operativi associati saranno rimossi definitivamente. Gli account Admin saranno conservati.'}</DialogContentText>
        {action === 'delete' && <TextField fullWidth label={`Scrivi ${entry.config.name}`} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoFocus />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions><Button disabled={deleting} onClick={() => setAction(null)}>Annulla</Button><Button color={action === 'delete' ? 'error' : 'primary'} variant="contained" disabled={deleting || (action === 'delete' && confirmation !== entry.config.name)} onClick={() => void confirm()}>{action === 'delete' ? 'ELIMINA DEFINITIVAMENTE' : `Conferma ${text}`}</Button></DialogActions>
    </Dialog>
  </Stack>
}
