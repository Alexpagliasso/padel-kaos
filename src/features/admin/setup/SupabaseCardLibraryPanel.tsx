import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardActions, CardContent, CardMedia, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import Add from '@mui/icons-material/Add'
import Image from '@mui/icons-material/Image'
import type { CardDefinition } from '../../../shared/types/domain'
import type { CardDefinitionInput } from '../../../repositories/contracts'
import { useSupabaseCardLibrary } from '../../../repositories/cardRepository'
import type { WorkspaceEntry } from '../workspace/workspaceStore'
import { validateCardDraft } from './cardDraftValidation'
import { validateCardImage } from '../../../domain/cards/cardImage'
import { removePersistedCardImage, replacePersistedCardImage } from '../../../repositories/cardImagePersistence'

const emptyDraft: CardDefinitionInput = {
  name: '', slug: '', description: '', longDescription: '', imageUrl: null, effectType: 'custom', targetType: 'own_team',
  durationType: 'instant', durationValue: null, canBeStolen: true, enabled: true,
}

export function SupabaseCardLibraryPanel({ entry }: { entry: WorkspaceEntry }) {
  const tournamentId = entry.domain.id || null
  const library = useSupabaseCardLibrary(tournamentId)
  const [editing, setEditing] = useState<CardDefinition | null>(null)
  const [draft, setDraft] = useState<CardDefinitionInput>(emptyDraft)
  const [open, setOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const imagePreview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : null, [imageFile])
  const activationLocked = entry.config.started || ['live', 'completed'].includes(entry.config.status) || entry.domain.status === 'archived'

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview) }, [imagePreview])

  const beginCreate = () => { setEditing(null); setDraft(emptyDraft); setImageFile(null); setLocalError(''); setOpen(true) }
  const beginEdit = (card: CardDefinition) => {
    setEditing(card)
    setDraft({
      name: card.name, slug: card.slug, description: card.description, longDescription: card.longDescription ?? card.description, imageUrl: card.imageUrl ?? null,
      effectType: card.effectType, targetType: card.targetType ?? 'own_team', durationType: card.durationType,
      durationValue: card.durationType === 'timed' || card.durationType === 'games' ? card.durationValue : null,
      canBeStolen: card.canBeStolen ?? false, enabled: card.enabled,
    })
    setImageFile(null); setLocalError(''); setOpen(true)
  }
  const save = async () => {
    const error = validateCardDraft(draft)
    if (error) { setLocalError(error); return }
    try {
      let card = editing ?? await library.createCardDefinition({ ...draft, imageUrl: null })
      if (!editing) setEditing(card)
      if (imageFile) {
        card = await replacePersistedCardImage(card, draft, imageFile, {
          upload: library.uploadCardImage, persist: library.updateCardDefinition, remove: library.removeCardImage,
          cleanupFailed: cleanup => console.warn('Pulizia immagine non riuscita', cleanup),
        })
      } else if (editing?.imageUrl && !draft.imageUrl) card = await removePersistedCardImage(editing, draft, {
        upload: library.uploadCardImage, persist: library.updateCardDefinition, remove: library.removeCardImage,
        cleanupFailed: cleanup => console.warn('Pulizia immagine rimossa non riuscita', cleanup),
      })
      else if (editing) card = await library.updateCardDefinition(editing.id, draft)
      setImageFile(null); setOpen(false)
    } catch (cause) {
      console.error('Salvataggio carta non riuscito', cause)
      setLocalError(cause instanceof Error ? cause.message : 'Impossibile salvare la carta.')
    }
  }
  const selectImage = (file: File | null) => {
    if (!file) return
    const error = validateCardImage(file)
    if (error) { setLocalError(error); return }
    setLocalError(''); setImageFile(file)
  }
  const archive = async (card: CardDefinition) => {
    if (!window.confirm(`Archiviare “${card.name}”? Verrà disattivata in tutti i tornei.`)) return
    setLocalError('')
    try { await library.archiveCardDefinition(card.id) }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'Impossibile archiviare la carta.') }
  }

  return <Stack spacing={3}>
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
      <Typography variant="h2">Libreria carte</Typography>
      <Button startIcon={<Add />} variant="contained" onClick={beginCreate}>Nuova carta</Button>
    </Stack>
    <Typography color="text.secondary">Le definizioni sono condivise. L’attivazione si applica solo a {entry.config.name}.</Typography>
    {activationLocked && <Alert severity="info">Le attivazioni non sono modificabili dopo l’inizio del torneo. Le definizioni restano disponibili per la gestione della libreria.</Alert>}
    {!tournamentId && <Alert severity="info">Seleziona un torneo per gestire l’attivazione delle carte.</Alert>}
    {(localError || library.error) && <Alert severity="error">{localError || library.error}</Alert>}
    {library.isLoading && <Typography color="text.secondary">Caricamento carte salvate…</Typography>}
    {!library.isLoading && library.cards.length === 0 && <Alert severity="info">Non sono disponibili carte attive.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 3 }}>
      {library.cards.map(({ definition, activeInTournament }) => <Card key={definition.id} sx={{ display: 'flex', flexDirection: 'column' }}>
        <CardArtwork imageUrl={definition.imageUrl} name={definition.name} />
        <CardContent sx={{ flex: 1 }}>
          <Typography variant="h3">{definition.name}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{definition.description}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{formatDuration(definition)} · {definition.canBeStolen ? 'Può essere rubata' : 'Non può essere rubata'}</Typography>
        </CardContent>
        <FormControlLabel sx={{ mx: 2 }} label="Attiva in questo torneo" control={<Switch checked={activeInTournament} disabled={!tournamentId || activationLocked || library.isMutating} slotProps={{ input: { 'aria-label': `Attiva in questo torneo: ${definition.name}` } }} onChange={async (_, checked) => {
          setLocalError('')
          try { await library.setTournamentCardEnabled(definition.id, checked) }
          catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'Impossibile modificare l’attivazione della carta.') }
        }} />} />
        <CardActions sx={{ px: 2, pb: 2 }}><Button onClick={() => beginEdit(definition)}>Modifica</Button><Button color="error" onClick={() => void archive(definition)}>Archivia</Button></CardActions>
      </Card>)}
    </Box>
    <Dialog open={open} onClose={() => !library.isMutating && setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? 'Modifica carta' : 'Crea carta'}</DialogTitle>
      <DialogContent><Stack spacing={2.5} sx={{ pt: 1 }}>
        <Box>
          <Typography sx={{ mb: 1, fontWeight: 800 }}>Immagine</Typography>
          <CardArtwork imageUrl={imagePreview ?? draft.imageUrl} name={draft.name || 'Anteprima carta'} />
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
            <Button component="label" variant="outlined" disabled={library.isMutating}>
              {imagePreview || draft.imageUrl ? 'Sostituisci immagine' : 'Carica immagine'}
              <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { selectImage(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} />
            </Button>
            {(imagePreview || draft.imageUrl) && <Button color="error" disabled={library.isMutating} onClick={() => { setImageFile(null); setDraft(current => ({ ...current, imageUrl: null })) }}>Rimuovi immagine</Button>}
          </Stack>
          <Typography variant="caption" color="text.secondary">JPG, PNG o WebP · massimo 5 MB</Typography>
        </Box>
        <TextField label="Nome" required autoFocus value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value, slug: editing ? current.slug : slugify(event.target.value) }))} />
        <TextField label="Descrizione breve" required multiline minRows={2} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} />
        <TextField label="Descrizione lunga" required multiline minRows={4} value={draft.longDescription} onChange={event => setDraft(current => ({ ...current, longDescription: event.target.value }))} />
        <TextField select label="Durata" value={draft.durationType} onChange={event => setDraft(current => ({ ...current, durationType: event.target.value as CardDefinitionInput['durationType'], durationValue: ['timed', 'games'].includes(event.target.value) ? current.durationValue ?? 1 : null }))}>
          <MenuItem value="instant">Istantanea</MenuItem><MenuItem value="timed">A tempo</MenuItem><MenuItem value="games">A game</MenuItem>
        </TextField>
        {draft.durationType === 'timed' && <TextField label="Durata in minuti" type="number" required value={draft.durationValue ?? ''} slotProps={{ htmlInput: { min: 1, step: 1 } }} onChange={event => setDraft(current => ({ ...current, durationValue: event.target.value ? Number(event.target.value) : null }))} />}
        {draft.durationType === 'games' && <TextField label="Numero di game" type="number" required value={draft.durationValue ?? ''} slotProps={{ htmlInput: { min: 1, step: 1 } }} onChange={event => setDraft(current => ({ ...current, durationValue: event.target.value ? Number(event.target.value) : null }))} />}
        <FormControlLabel label="Può essere rubata" control={<Switch checked={draft.canBeStolen} onChange={(_, checked) => setDraft(current => ({ ...current, canBeStolen: checked }))} />} />
        {localError && <Alert severity="error">{localError}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={library.isMutating} onClick={() => setOpen(false)}>Annulla</Button><Button variant="contained" disabled={library.isMutating} onClick={() => void save()}>{library.isMutating ? 'Salvataggio…' : 'Salva carta'}</Button></DialogActions>
    </Dialog>
  </Stack>
}

function CardArtwork({ imageUrl, name }: { imageUrl?: string | null; name: string }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  if (imageUrl && imageUrl !== brokenUrl) return <CardMedia component="img" height="180" image={imageUrl} alt={name} onError={() => setBrokenUrl(imageUrl)} sx={{ objectFit: 'cover', borderRadius: 1 }} />
  return <Box sx={{ height: 180, background: 'var(--event-gradient)', display: 'grid', placeItems: 'center', borderRadius: 1 }}><Stack sx={{ alignItems: 'center' }}><Image sx={{ fontSize: 56, color: 'primary.main' }} /><Typography color="text.secondary">Nessuna immagine</Typography></Stack></Box>
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function formatDuration(card: CardDefinition) {
  if (card.durationType === 'timed') return `A tempo · ${card.durationValue} min`
  if (card.durationType === 'games') return `A game · ${card.durationValue}`
  return 'Istantanea'
}
