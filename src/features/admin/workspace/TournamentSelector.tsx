import { useState } from 'react'
import { isSupabaseProvider } from '../../../repositories'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material'
import Add from '@mui/icons-material/Add'
import { useNavigate } from 'react-router-dom'
import { useAdminWorkspace } from './useAdminWorkspace'
import { StatusChip } from '../../../shared/components/Foundation'

export function TournamentSelector() {
  const workspace = useAdminWorkspace()
  const { entry, available } = workspace
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
      <TextField select label="Torneo" value={entry?.domain.id ?? ''} sx={{ minWidth: { sm: 280 }, flex: 1 }} onChange={async event => {
        const id = event.target.value
        if (!isSupabaseProvider()) {
          const { activateDemoTournament } = await import('../../../dev/demoTestData')
          activateDemoTournament(id)
        }
        workspace.selectTournament(id)
      }}>
        {!available.length && <MenuItem value="">Nessun torneo</MenuItem>}
        {available.map(item => <MenuItem key={item.domain.id} value={item.domain.id}>{item.config.name} / {item.config.status}</MenuItem>)}
      </TextField>
      {entry && <StatusChip label={entry.config.status} />}
      <Button startIcon={<Add />} variant="outlined" onClick={() => { setName(''); setError(''); setOpen(true) }}>Nuovo torneo</Button>
    </Stack>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={async event => {
        event.preventDefault()
        if (!name.trim() || creating) return
        setCreating(true); setError('')
        try {
          await workspace.createTournament(name)
          setOpen(false)
          navigate('/admin/setup')
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Impossibile creare il torneo.')
        } finally { setCreating(false) }
      }}>
        <DialogTitle>Crea torneo</DialogTitle>
        <DialogContent><Alert severity="info" sx={{ mb: 3 }}>{workspace.remote ? 'Il torneo verrà salvato su Supabase e selezionato dopo la creazione.' : 'Area temporanea. Le modifiche restano solo in questa sessione.'}</Alert><TextField label="Nome torneo" value={name} onChange={event => setName(event.target.value)} autoFocus required fullWidth />{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent>
        <DialogActions><Button disabled={creating} onClick={() => setOpen(false)}>Annulla</Button><Button type="submit" variant="contained" disabled={!name.trim() || creating}>{creating ? 'Creazione…' : 'Crea torneo'}</Button></DialogActions>
      </Box>
    </Dialog>
  </Box>
}
