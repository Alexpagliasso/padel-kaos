import { Box, CardActionArea, Paper, Stack, Typography } from '@mui/material'
import CheckCircle from '@mui/icons-material/CheckCircle'
import { PageShell, PrimaryAction, SectionHeader, StatusChip, TournamentLogo } from '../../../shared/components/Foundation'
import { tournamentPresets, resolvePalette } from '../../../theme/tournamentPresets'
import { useTournamentTheme } from '../../../theme/themeContext'
export function Appearance() {
  const { preset, custom, setPreset, setCustom } = useTournamentTheme()
  const palettes = [...tournamentPresets, resolvePalette('custom', custom)]
  return <PageShell>
    <SectionHeader eyebrow="Aspetto" title="Tema del torneo" detail="Scegli il colore del tuo evento. La preview e tutte le aree si aggiornano subito." />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2 }}>{palettes.map(p => <Paper key={p.id} sx={{ overflow: 'hidden', borderColor: preset === p.id ? 'primary.main' : 'divider' }}>
      <CardActionArea aria-pressed={preset === p.id} onClick={() => setPreset(p.id)} sx={{ p: 2 }}>
        <Box sx={{ height: 72, borderRadius: 1, bgcolor: p.primary, mb: 2 }} />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 800 }}>{p.name}</Typography>{preset === p.id && <CheckCircle color="primary" />}</Stack>
      </CardActionArea>
    </Paper>)}</Box>{preset === 'custom' && <Stack spacing={1} sx={{ my: 3 }}>
      <Typography component="label" htmlFor="custom-color" sx={{ fontWeight: 800 }}>Custom tournament color</Typography>
      <input id="custom-color" type="color" value={custom} onChange={event => setCustom(event.target.value)} style={{ width: 96, height: 56, cursor: 'pointer' }} />
      <Typography color="text.secondary">{custom} / Il contrasto viene adattato per mantenere il testo leggibile.</Typography>
    </Stack>}<Paper sx={{ mt: 4, p: { xs: 3, md: 5 }, background: 'var(--event-gradient)' }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
        <TournamentLogo />
        <StatusChip label="live" />
      </Stack>
      <Typography variant="h2" sx={{ mt: 5 }}>YOUR COURT. YOUR KAOS.</Typography>
      <Typography color="text.secondary" sx={{ my: 2 }}>Anteprima dal vivo / Campo 01</Typography>
      <Typography sx={{ fontSize: 'clamp(4rem, 10vw, 9rem)', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'primary.main' }}>40 : 30</Typography>
      <PrimaryAction onClick={() => setPreset('orange')}>Ripristina Orange</PrimaryAction>
    </Paper>
    <Typography color="text.secondary" sx={{ fontSize: 13, mt: 2 }}>Tema temporaneo per questa sessione; al ricaricamento torna Orange.</Typography>
  </PageShell>
}
