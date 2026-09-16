import { useState } from 'react'
import { Alert, Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import { useTournamentTheme } from '../../../theme/themeContext'
import { tournamentPresets, type PresetId } from '../../../theme/tournamentPresets'
import { useWorkspaceStore, type WorkspaceEntry } from '../workspace/workspaceStore'
import { TournamentStructurePreview } from './TournamentStructurePreview'

export function GeneralSetup({ entry, onSave, persisted = false }: { entry: WorkspaceEntry; onSave?: (entry: WorkspaceEntry, config: WorkspaceEntry['config']) => string[] | Promise<string[]>; persisted?: boolean }) {
  const [draft, setDraft] = useState(entry.config)
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveConfig = useWorkspaceStore(state => state.saveConfig)
  const theme = useTournamentTheme()
  const locked = entry.config.started || entry.config.status === 'live' || entry.config.status === 'completed'
  const usingDefaults = persisted && [entry.domain.teamsCount, entry.domain.teamsPerGroup, entry.domain.goldQualifiedCount, entry.domain.silverQualifiedCount, entry.domain.courtsCount].some(value => value === null || value === undefined)
  const finishSave = (result: string[]) => {
    setSaving(false)
    setErrors(result); setSaved(result.length === 0)
    if (!result.length) { theme.setPreset(draft.theme); theme.setCustom(draft.customColor) }
  }
  return <Paper component="form" sx={{ p: { xs: 2, md: 4 } }} onSubmit={event => {
    event.preventDefault()
    const result = onSave ? onSave(entry, draft) : saveConfig(entry, draft)
    if (result instanceof Promise) {
      setSaving(true)
      void result.then(finishSave).catch(error => finishSave([error instanceof Error ? error.message : 'Impossibile salvare la configurazione del torneo.']))
    } else {
      finishSave(result)
    }
  }}>
    <Typography variant="h2" sx={{ mb: 3 }}>Generale</Typography>
    {usingDefaults && <Alert severity="info" sx={{ mb: 3 }}>Questo torneo in bozza non ha ancora una struttura salvata. I valori mostrati saranno salvati sul server solo premendo Salva.</Alert>}
    {locked && <Alert severity="info" sx={{ mb: 3 }}>I campi strutturali non sono modificabili dopo l’inizio del torneo.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
      <TextField label="Nome torneo" required value={draft.name} disabled={locked} onChange={event => { setDraft({ ...draft, name: event.target.value }); setSaved(false) }} sx={{ gridColumn: '1 / -1' }} />
      {([['teamsCount', 'Numero di squadre', 2], ['teamsPerGroup', 'Squadre per girone', 2], ['goldQualifiedCount', 'Qualificate Gold', 0], ['silverQualifiedCount', 'Qualificate Silver', 0], ['courtsCount', 'Campi disponibili', 1]] as const).map(([key, label, min]) => <TextField key={key} label={label} type="number" required disabled={locked} value={Number.isNaN(draft[key]) ? '' : draft[key]} slotProps={{ htmlInput: { min, step: 1 } }} onChange={event => { setDraft({ ...draft, [key]: event.target.value === '' ? NaN : Number(event.target.value) }); setSaved(false) }} />)}
      <TextField select label="Colore tema torneo" value={draft.theme} disabled={locked} onChange={event => { setDraft({ ...draft, theme: event.target.value as PresetId }); setSaved(false) }}>{tournamentPresets.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}<MenuItem value="custom">Personalizzato</MenuItem></TextField>
      {draft.theme === 'custom' && <TextField label="Colore personalizzato" type="color" value={draft.customColor} disabled={locked} onChange={event => { setDraft({ ...draft, customColor: event.target.value }); setSaved(false) }} />}
      <FormControlLabel label="Consenti BYE" control={<Switch checked={draft.allowByes} disabled={locked} slotProps={{ input: { 'aria-label': 'Consenti BYE' } }} onChange={(_, checked) => { setDraft({ ...draft, allowByes: checked }); setSaved(false) }} />} />
    </Box>
    <Typography color="text.secondary" sx={{ mt: 2 }}>BYE {draft.allowByes ? 'consentiti' : 'disattivati'} per questo torneo. Nei tornei Padel Kaos sono consentiti per impostazione predefinita.</Typography>
    <TournamentStructurePreview config={draft} />
    <Stack spacing={2} sx={{ mt: 3 }}>
      {errors.length > 0 && <Alert severity="error">{errors.join(' ')}</Alert>}
      {saved && <Alert severity="success">Configurazione salvata{persisted ? ' su Supabase' : ' per questa sessione'}.</Alert>}
      {!locked && <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Salvataggio…' : 'Salva configurazione'}</Button>}
    </Stack>
  </Paper>
}
