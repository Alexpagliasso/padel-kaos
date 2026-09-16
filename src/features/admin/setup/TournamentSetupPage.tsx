import { lazy, Suspense, useContext, useState } from 'react'
import { AuthContext } from '../../auth/authContext'
// TODO: restrict/remove before production release
const TestDataPanel = lazy(() => import('../../../dev/TestDataPanel'))
import { Alert, Box, Divider, Paper, Stack, Tab, Tabs, Typography } from '@mui/material'
import { EmptyState, PageShell, SectionHeader, StatusChip } from '../../../shared/components/Foundation'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { GeneralSetup } from './GeneralSetup'
import { LibraryPanel } from './LibraryPanel'
import { TournamentLifecycle } from './TournamentLifecycle'
import { TournamentSetupContent } from './TournamentSetup'
import { isSupabaseProvider } from '../../../repositories'
import { TournamentStructurePreview } from './TournamentStructurePreview'
import { GroupSetup } from './GroupSetup'

export type SetupSection = 'GENERAL' | 'TEAMS' | 'GROUPS' | 'CARDS' | 'SPECIAL EVENTS' | 'SUMMARY' | 'TEST DATA'
const sections: SetupSection[] = ['GENERAL', 'TEAMS', 'GROUPS', 'CARDS', 'SPECIAL EVENTS', 'TEST DATA', 'SUMMARY']
const sectionLabels: Record<SetupSection, string> = { GENERAL: 'GENERALE', TEAMS: 'SQUADRE', GROUPS: 'GIRONI', CARDS: 'CARTE', 'SPECIAL EVENTS': 'EVENTI SPECIALI', 'TEST DATA': 'DATI DI TEST', SUMMARY: 'RIEPILOGO' }
export function TournamentSetupPage({ initialSection = 'GENERAL' }: { initialSection?: SetupSection }) {
  const auth = useContext(AuthContext)
  const showDev = auth?.status === 'authenticated' && auth.profile?.role === 'admin'
  const workspace = useAdminWorkspace()
  const [section, setSection] = useState(initialSection)
  const { entry, data: tournament, state } = workspace
  if (!entry) return <PageShell><EmptyState title="Crea un torneo per iniziare" detail="Usa Nuovo torneo nell’intestazione." />{showDev && <Suspense fallback={<Typography>Caricamento dati di test…</Typography>}><TestDataPanel /></Suspense>}</PageShell>
  if (workspace.isLoading && !entry.local) return <PageShell><EmptyState title="Caricamento torneo" /></PageShell>
  if (workspace.error && !entry.local) return <PageShell><EmptyState title="Impossibile caricare il torneo" detail={workspace.error} /></PageShell>
  return <PageShell>
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'start', gap: 2 }}><SectionHeader eyebrow="Configurazione torneo" title={entry.config.name} detail="Prepara l’evento scegliendo squadre, carte e momenti speciali." /><StatusChip label={entry.config.status} /></Stack>
    <Alert severity="info" sx={{ mb: 3 }}>{workspace.remote ? 'La configurazione è caricata da Supabase. Salva le modifiche nella sezione Generale.' : 'Configurazione e librerie sono temporanee per questa sessione. I tornei demo restano nel provider demo.'}</Alert>
    <Tabs value={section} onChange={(_, value: SetupSection) => setSection(value)} variant="scrollable" scrollButtons="auto" aria-label="Sezioni configurazione torneo" sx={{ mb: 3 }}>{sections.filter(item => item !== 'TEST DATA' || showDev).map(item => <Tab key={item} value={item} label={sectionLabels[item]} id={`setup-tab-${item}`} aria-controls="setup-panel" />)}</Tabs>
    <Box role="tabpanel" id="setup-panel" aria-labelledby={`setup-tab-${section}`}>
      {section === 'GROUPS' && <GroupSetup />}
      {section === 'TEST DATA' && showDev && <Suspense fallback={<Typography>Caricamento strumenti di sviluppo…</Typography>}><TestDataPanel key={tournament.id} /></Suspense>}
      {section === 'GENERAL' && <GeneralSetup key={tournament.id} entry={entry} persisted={workspace.remote} onSave={workspace.saveTournamentConfig} />}
      {section === 'TEAMS' && <TournamentSetupContent key={tournament.id} tournament={tournament} initialTab="TEAMS" embedded enableTeamAccess={!entry.local && isSupabaseProvider()} repositoryOverride={entry.local ? { createTeam: input => state.saveTeam(entry, input), updateTeam: (id, input) => state.saveTeam(entry, input, id), setTeamRanking: (_tournamentId, teamId, ranking) => state.setTeamRanking(entry, teamId, ranking), assignRandomTeamRankings: () => state.assignRandomTeamRankings(entry) } : undefined} />}
      {(section === 'CARDS' || section === 'SPECIAL EVENTS') && <LibraryPanel key={`${tournament.id}-${section}`} entry={entry} kind={section === 'CARDS' ? 'cards' : 'events'} />}
      {section === 'SUMMARY' && <Paper sx={{ p: { xs: 2, md: 4 } }}>
        <Typography variant="h2" sx={{ mb: 3 }}>Pronti per il primo servizio?</Typography>
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, mb: 4 }}>
          {Object.entries({ Torneo: entry.config.name, Squadre: `${tournament.teams.length} iscritte / ${entry.config.teamsCount} previste`, 'Qualificate Gold': entry.config.goldQualifiedCount, 'Qualificate Silver': entry.config.silverQualifiedCount, Campi: entry.config.courtsCount, Tema: entry.config.theme, 'Carte attive': entry.activeCards.length, 'Eventi speciali attivi': entry.activeEvents.length }).map(([label, value]) => <Box key={label}><Typography component="dt" color="text.secondary">{label}</Typography><Typography component="dd" sx={{ m: 0, fontWeight: 850, fontSize: 24 }}>{value}</Typography></Box>)}
        </Box>
        {tournament.teams.length !== entry.config.teamsCount && <Alert severity="warning" sx={{ mb: 3 }}>Le squadre iscritte non corrispondono al numero previsto. L’avvio qui mostra il ciclo del torneo senza generare il calendario.</Alert>}
        <TournamentStructurePreview config={entry.config} />
        <Divider sx={{ my: 3 }} /><TournamentLifecycle entry={entry} />
      </Paper>}
    </Box>
  </PageShell>
}
