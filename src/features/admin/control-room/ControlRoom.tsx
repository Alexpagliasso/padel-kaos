import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { PageShell, SectionHeader, EmptyState, StatusChip } from '../../../shared/components/Foundation'
import { formatStatusLabel } from '../../../shared/lib/uiLabels'
import type { Tournament } from '../../../shared/types/domain'
import { useScheduleManagement } from '../../../repositories/scheduleRepository'
import { entryFromTournament, useWorkspaceStore, type WorkspaceEntry } from '../workspace/workspaceStore'
import { MatchReportCard } from '../reports/MatchReportCard'
import { OperationsControls } from './OperationsControls'
import { getControlRoomRound, getCurrentRoundMatches } from './controlRoomState'

export function ControlRoom() {
  const workspace = useScheduleManagement()
  if (!workspace.entry) return <PageShell><EmptyState title="Seleziona o crea un torneo" /></PageShell>
  if (workspace.isLoading && !workspace.entry.local) return <PageShell><EmptyState title="Caricamento regia" /></PageShell>
  if (workspace.error && !workspace.entry.local) return <PageShell><EmptyState title="Impossibile caricare la regia" detail={workspace.error} /></PageShell>
  return <ControlRoomContent key={workspace.data.id} tournament={workspace.data} entry={workspace.entry} referees={workspace.referees} />
}
export function ControlRoomContent({ tournament, entry: providedEntry, referees = [] }: {
  tournament: Tournament; entry?: WorkspaceEntry
  referees?: Array<{ courtId: string; name: string }>
  porTresPrizeDraft?: string; onPorTresPrizeChange?: (value: string) => void
  onActivatePorTres?: (prize: string) => void; onRollGlobalDice?: (matchId: string) => void
}) {
  const state = useWorkspaceStore()
  const entry = providedEntry ?? state.entries[tournament.id] ?? entryFromTournament(tournament)
  const round = getControlRoomRound(tournament)
  const matches = getCurrentRoundMatches(tournament, round)
  const reports = state.reports.filter(report => report.tournamentId === tournament.id)
  const waiting = matches.filter(match => match.status === 'completed' && !reports.some(report => report.matchId === match.id))
  const flagged = reports.filter(report => report.status === 'review')
  return <PageShell>
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}><SectionHeader eyebrow="Regia / Gestione evento" title={tournament.name} detail={round?.name ?? 'Nessun turno configurato'} /><StatusChip label={entry.config.status} /></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 360px' }, gap: 3 }}>
      <Stack spacing={3} sx={{ minWidth: 0 }}>
        <Paper sx={{ p: 3 }}><Typography variant="h3" sx={{ mb: 2 }}>Avvisi</Typography>
          <Stack spacing={1}>
            {waiting.length > 0 && <Alert severity="warning">{waiting.length} partite completate in attesa del report arbitrale.</Alert>}
            {flagged.length > 0 && <Alert severity="warning">{flagged.length} report partita segnalati per revisione.</Alert>}
            {!round && <Alert severity="info">Nessun turno configurato</Alert>}
            {!waiting.length && !flagged.length && round && <Alert severity="success">Nessun avviso operativo.</Alert>}
          </Stack>
        </Paper>
        <Box><Typography variant="h2" sx={{ mb: 2 }}>Stato campi</Typography>
          {!matches.length && <Alert severity="info" sx={{ mb: 2 }}>Nessuna partita configurata</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {tournament.courts.map(court => {
              const courtMatches = matches.filter(match => match.courtId === court.id)
              return <Paper key={court.id} sx={{ p: 3 }}><Typography color="primary" sx={{ fontWeight: 900, mb: 2 }}>{court.name}</Typography>
                {!courtMatches.length && <Typography color="text.secondary">Campo disponibile / nessuna partita assegnata</Typography>}
                {courtMatches.map(match => {
                  const report = reports.find(item => item.matchId === match.id)
                  const requiredSet = match.status === 'set_break' || match.status === 'live_set_2' ? 2 : 1
                  const missing = [match.teamAId, match.teamBId].filter(teamId => !match.lineups.some(lineup => lineup.teamId === teamId && lineup.setNumber === requiredSet))
                  const cards = tournament.teamCards.filter(card => card.matchId === match.id).length
                  const referee = referees.find(item => item.courtId === court.id)?.name ?? 'Da assegnare'
                  return <Box key={match.id} sx={{ mb: 2 }}><Typography sx={{ fontWeight: 850, mb: 1 }}>{tournament.teams.find(team => team.id === match.teamAId)?.name ?? 'Da definire'} vs {tournament.teams.find(team => team.id === match.teamBId)?.name ?? 'Da definire'}</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><StatusChip label={match.status} /><Chip size="small" label={`Arbitro · ${referee}`} /><Chip size="small" color={missing.length ? 'warning' : 'success'} label={missing.length ? 'Formazioni incomplete' : 'Formazioni pronte'} /><Chip size="small" color={cards ? 'success' : 'warning'} label={cards ? `Carte assegnate · ${cards}` : 'Carte da assegnare'} />{report && <Chip size="small" label={'Report · ' + formatStatusLabel(report.status)} />}</Stack></Box>
                })}
              </Paper>
            })}
          </Box>
        </Box>
        <Box><Typography variant="h2" sx={{ mb: 2 }}>Report finali delle partite</Typography><Stack spacing={3}>{reports.length ? reports.map(report => <MatchReportCard key={report.id} report={report} />) : <EmptyState title="Nessun report partita inviato" detail="Arbitro invia il report finale dopo aver completato la partita." />}</Stack></Box>
      </Stack>
      <Box component="aside"><OperationsControls entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name} /></Box>
    </Box>
  </PageShell>
}
