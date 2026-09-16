import { useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material'
import FactCheck from '@mui/icons-material/FactCheck'
import { useWorkspaceStore, type MatchReport } from '../workspace/workspaceStore'
import { formatStatusLabel } from '../../../shared/lib/uiLabels'

export function MatchReportCard({ report }: { report: MatchReport }) {
  const review = useWorkspaceStore(state => state.reviewReport)
  const [flag, setFlag] = useState(false)
  const [note, setNote] = useState('')
  return <Paper component="article" sx={{ p: { xs: 2, md: 3 }, borderColor: report.status === 'review' ? 'warning.main' : 'divider' }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 }}><Typography variant="h3"><FactCheck sx={{ mr: 1, verticalAlign: 'middle', color: 'primary.main' }} />Report partita</Typography><Chip label={formatStatusLabel(report.status)} color={report.status === 'approved' ? 'success' : report.status === 'review' ? 'warning' : 'primary'} /></Stack>
    <Typography color="text.secondary">{report.court} / {report.matchId}</Typography>
    <Typography sx={{ fontWeight: 900, fontSize: 'clamp(1.2rem, 2vw, 2rem)', mt: 1 }}>{report.teams.join(' vs ')}</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, my: 3 }}>
      <ReportSection title="RISULTATO"><Typography sx={{ fontSize: 56, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'primary.main' }}>{report.result}</Typography></ReportSection>
      <ReportSection title="SET">{report.sets.map(set => <Typography key={set.number} sx={{ fontWeight: 750 }}>{set.number === 3 ? 'Super Tie-Break' : `Set ${set.number}`} / {set.a} - {set.b}</Typography>)}</ReportSection>
      <ReportSection title="FORMAZIONI">{report.lineups.length ? report.lineups.map((lineup, index) => <Typography key={index} sx={{ mb: 1 }}>{lineup.set === 3 ? 'Super Tie-Break' : `Set ${lineup.set}`} / {lineup.team}: {lineup.players.join(' + ')}</Typography>) : <Typography color="text.secondary">Formazioni non registrate</Typography>}</ReportSection>
      <ReportSection title="CARTE USATE">{report.cards.length ? report.cards.map((card, index) => <Typography key={index}>{card.team} / {card.title}</Typography>) : <Typography color="text.secondary">Nessuna carta utilizzata</Typography>}</ReportSection>
      <ReportSection title="EVENTO SPECIALE / PREMIO">{report.prizes.length ? report.prizes.map((prize, index) => <Typography key={index}>{prize}</Typography>) : <Typography color="text.secondary">Nessun premio registrato su questo campo</Typography>}</ReportSection>
      <ReportSection title="ARBITRO"><Typography>{report.referee}</Typography><Typography color="text.secondary" sx={{ fontSize: 13 }}>{new Date(report.submittedAt).toLocaleString('it-IT')}</Typography></ReportSection>
    </Box>
    {report.reviewNote && <Typography sx={{ color: 'warning.main', mb: 2 }}>Nota di revisione: {report.reviewNote}</Typography>}
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}><Button variant="contained" disabled={report.status === 'approved'} onClick={() => review(report.id, 'approved')}>APPROVE RESULT</Button><Button variant="outlined" color="warning" disabled={report.status === 'approved'} onClick={() => { setNote(''); setFlag(true) }}>FLAG FOR REVIEW</Button></Stack>
    <Dialog open={flag} onClose={() => setFlag(false)} maxWidth="sm" fullWidth><DialogTitle>Segnala report da rivedere</DialogTitle><DialogContent><TextField sx={{ mt: 1 }} autoFocus fullWidth multiline minRows={3} label="Nota di revisione" value={note} onChange={event => setNote(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setFlag(false)}>Annulla</Button><Button disabled={!note.trim()} onClick={() => { review(report.id, 'review', note.trim()); setFlag(false) }}>Segnala per revisione</Button></DialogActions></Dialog>
  </Paper>
}
function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <Box><Typography sx={{ fontWeight: 800, fontSize: 12, letterSpacing: '.12em', color: 'text.secondary', mb: 1 }}>{title}</Typography>{children}</Box>
}
