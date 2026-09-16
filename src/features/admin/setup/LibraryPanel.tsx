import { useState } from 'react'
import { Alert, Box, Button, Card, CardActions, CardContent, CardMedia, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import Add from '@mui/icons-material/Add'
import Image from '@mui/icons-material/Image'
import { useWorkspaceStore, type LibraryCard, type WorkspaceEntry } from '../workspace/workspaceStore'
import { isSupabaseProvider } from '../../../repositories'
import { demoCardImageRepository } from '../../../repositories/demo/demoCardImageRepository'
import { SupabaseCardLibraryPanel } from './SupabaseCardLibraryPanel'

export function LibraryPanel({ entry, kind }: { entry: WorkspaceEntry; kind: 'cards' | 'events' }) {
  if (kind === 'cards' && isSupabaseProvider() && !entry.local) return <SupabaseCardLibraryPanel entry={entry} />
  return <DemoLibraryPanel entry={entry} kind={kind} />
}

function DemoLibraryPanel({ entry, kind }: { entry: WorkspaceEntry; kind: 'cards' | 'events' }) {
  const state = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [longDescription, setLongDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [originalImageUrl, setOriginalImageUrl] = useState('')
  const [imageError, setImageError] = useState('')
  const [canBeStolen, setCanBeStolen] = useState(true)
  const [durationType, setDurationType] = useState<'instant' | 'timed' | 'games'>('instant')
  const [durationValue, setDurationValue] = useState<number | null>(null)
  const [prize, setPrize] = useState('')
  const cards = kind === 'cards'
  const libraryCards: LibraryCard[] = [...state.cards, ...entry.domain.cards.filter(card => !state.cards.some(item => item.id === card.id)).map((card): LibraryCard => ({
    id: card.id, title: card.name, description: card.description, longDescription: card.longDescription ?? card.description,
    imageUrl: card.imageUrl ?? '', canBeStolen: card.canBeStolen ?? false,
    durationType: card.durationType === 'timed' || card.durationType === 'games' ? card.durationType : 'instant',
    durationValue: card.durationType === 'timed' || card.durationType === 'games' ? card.durationValue : null, active: card.enabled,
  }))]
  const activeIds = cards ? entry.activeCards : entry.activeEvents
  const invalidDuration = (durationType === 'timed' || durationType === 'games') && (!durationValue || durationValue < 1 || !Number.isInteger(durationValue))

  function beginCreate() {
    setEditingCardId(null); setTitle(''); setDescription(''); setLongDescription(''); setImageUrl(''); setOriginalImageUrl(''); setImageError('')
    setCanBeStolen(true); setDurationType('instant'); setDurationValue(null); setPrize(''); setOpen(true)
  }
  function beginEdit(card: LibraryCard) {
    setEditingCardId(card.id); setTitle(card.title); setDescription(card.description); setLongDescription(card.longDescription ?? card.description)
    setImageUrl(card.imageUrl); setOriginalImageUrl(card.imageUrl); setImageError(''); setCanBeStolen(card.canBeStolen ?? false); setDurationType(card.durationType ?? 'instant')
    setDurationValue(card.durationValue ?? null); setOpen(true)
  }
  function selectImage(file?: File) {
    if (!file) return
    try {
      const next = demoCardImageRepository.upload(file)
      if (imageUrl && imageUrl !== originalImageUrl) demoCardImageRepository.remove(imageUrl)
      setImageUrl(next); setImageError('')
    } catch (cause) { setImageError(cause instanceof Error ? cause.message : "Impossibile caricare l'immagine") }
  }
  function save() {
    if (!title.trim() || !description.trim() || (cards && (!longDescription.trim() || invalidDuration))) return
    if (cards) {
      const input = { title: title.trim(), description: description.trim(), longDescription: longDescription.trim(), imageUrl, canBeStolen, durationType, durationValue: durationType === 'instant' ? null : durationValue }
      if (editingCardId) state.updateCard(editingCardId, input)
      else state.addCard(input)
      if (originalImageUrl && originalImageUrl !== imageUrl) demoCardImageRepository.remove(originalImageUrl)
    } else state.addEvent({ name: title.trim(), description: description.trim(), prize: prize.trim() })
    setOpen(false)
  }
  function close() {
    if (imageUrl && imageUrl !== originalImageUrl) demoCardImageRepository.remove(imageUrl)
    setOpen(false)
  }

  const items = cards ? libraryCards : state.events.map(event => ({ ...event, title: event.name }))
  return <Stack spacing={3}>
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}><Typography variant="h2">{cards ? 'Libreria carte' : 'Libreria eventi speciali'}</Typography><Button startIcon={<Add />} variant="contained" onClick={beginCreate}>{cards ? 'Nuova carta' : 'Nuovo evento'}</Button></Stack>
    <Typography color="text.secondary">Libreria condivisa. Le attivazioni appartengono solo a {entry.config.name}.</Typography>
    {entry.config.started && <Alert severity="info">Le attivazioni sono bloccate dopo l’avvio.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 3 }}>{items.map(item => <Card key={item.id}>
      {'imageUrl' in item && item.imageUrl ? <CardMedia component="img" height="160" image={item.imageUrl} alt={item.title} sx={{ objectFit: 'cover' }} /> : <Box sx={{ height: 160, background: 'var(--event-gradient)', display: 'grid', placeItems: 'center' }}><Image color="primary" /></Box>}
      <CardContent><Typography variant="h3">{item.title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{item.description}</Typography>
        {'canBeStolen' in item && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{formatDemoDuration(item)} · {item.canBeStolen ? 'Può essere rubata' : 'Non può essere rubata'}</Typography>}
        {'prize' in item && item.prize && <Typography sx={{ mt: 2 }}>Premio · {item.prize}</Typography>}
      </CardContent>
      {cards && <CardActions><Button onClick={() => beginEdit(item as LibraryCard)}>Modifica</Button></CardActions>}
      <FormControlLabel sx={{ mx: 2, mb: 2 }} label="Attiva in questo torneo" control={<Switch checked={activeIds.includes(item.id)} disabled={entry.config.started} slotProps={{ input: { 'aria-label': `Attiva in questo torneo: ${item.title}` } }} onChange={(_, checked) => state.toggle(entry, kind, item.id, checked)} />} />
    </Card>)}</Box>
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm"><Box component="form" onSubmit={event => { event.preventDefault(); save() }}>
      <DialogTitle>{editingCardId ? 'Modifica carta' : `Crea ${cards ? 'carta' : 'evento speciale'}`}</DialogTitle><DialogContent><Stack spacing={3} sx={{ pt: 1 }}>
        {cards && <ImageEditor imageUrl={imageUrl} error={imageError} onSelect={selectImage} onRemove={() => { if (imageUrl !== originalImageUrl) demoCardImageRepository.remove(imageUrl); setImageUrl('') }} />}
        <TextField label={cards ? 'Nome' : 'Nome evento'} value={title} onChange={event => setTitle(event.target.value)} required autoFocus />
        <TextField label={cards ? 'Descrizione breve' : 'Descrizione'} value={description} onChange={event => setDescription(event.target.value)} required multiline minRows={2} />
        {cards && <><TextField label="Descrizione lunga" value={longDescription} onChange={event => setLongDescription(event.target.value)} required multiline minRows={4} /><FormControlLabel label="Può essere rubata" control={<Switch checked={canBeStolen} onChange={(_, checked) => setCanBeStolen(checked)} />} /><TextField select label="Durata" value={durationType} onChange={event => { const value = event.target.value as typeof durationType; setDurationType(value); setDurationValue(value === 'instant' ? null : durationValue ?? 1) }}><MenuItem value="instant">Istantanea</MenuItem><MenuItem value="timed">A tempo</MenuItem><MenuItem value="games">A game</MenuItem></TextField>{durationType !== 'instant' && <TextField label={durationType === 'timed' ? 'Durata in minuti' : 'Numero di game'} type="number" required value={durationValue ?? ''} slotProps={{ htmlInput: { min: 1, step: 1 } }} onChange={event => setDurationValue(event.target.value ? Number(event.target.value) : null)} />}</>}
        {!cards && <TextField label="Premio (facoltativo)" value={prize} onChange={event => setPrize(event.target.value)} />}
      </Stack></DialogContent><DialogActions><Button onClick={close}>Annulla</Button><Button type="submit" variant="contained" disabled={!title.trim() || !description.trim() || (cards && (!longDescription.trim() || invalidDuration))}>{editingCardId ? 'Salva carta' : `Crea ${cards ? 'carta' : 'evento'}`}</Button></DialogActions>
    </Box></Dialog>
  </Stack>
}

function ImageEditor({ imageUrl, error, onSelect, onRemove }: { imageUrl: string; error: string; onSelect: (file?: File) => void; onRemove: () => void }) {
  return <Box><Typography sx={{ mb: 1, fontWeight: 800 }}>Immagine</Typography>{imageUrl ? <CardMedia component="img" height="180" image={imageUrl} alt="Anteprima carta" sx={{ objectFit: 'cover', borderRadius: 1 }} /> : <Box sx={{ height: 180, background: 'var(--event-gradient)', display: 'grid', placeItems: 'center', borderRadius: 1 }}><Typography color="text.secondary">Nessuna immagine</Typography></Box>}<Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button component="label" variant="outlined">{imageUrl ? 'Sostituisci immagine' : 'Carica immagine'}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { onSelect(event.target.files?.[0]); event.currentTarget.value = '' }} /></Button>{imageUrl && <Button color="error" onClick={onRemove}>Rimuovi immagine</Button>}</Stack><Typography variant="caption" color="text.secondary">JPG, PNG o WebP · massimo 5 MB</Typography>{error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}</Box>
}

function formatDemoDuration(card: LibraryCard) {
  if (card.durationType === 'timed') return `A tempo · ${card.durationValue} min`
  if (card.durationType === 'games') return `A game · ${card.durationValue}`
  return 'Istantanea'
}
