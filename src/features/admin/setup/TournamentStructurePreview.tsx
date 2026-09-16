import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { calculateTournamentSetup } from '../../../domain/tournament/tournamentSetupEngine'
import type { TournamentSetupConfig } from '../../../domain/tournament/tournamentTypes'

export function TournamentStructurePreview({ config }: { config: TournamentSetupConfig }) {
  const result = calculateTournamentSetup(config)
  const plan = result.plan
  return <Paper component="section" aria-label="Struttura torneo" sx={{ p: { xs: 2, md: 3 }, mt: 3, background: 'var(--event-gradient)' }}>
    <Typography variant="h2" sx={{ mb: 2 }}>Struttura torneo</Typography>
    <Stack spacing={1} sx={{ mb: 2 }}>
      {result.errors.map(issue => <Alert key={`${issue.field}-${issue.code}`} severity="error">{issue.message}</Alert>)}
      {result.warnings.map(issue => <Alert key={`${issue.field}-${issue.code}`} severity="warning">{issue.message}</Alert>)}
    </Stack>
    {plan && <>
      <Typography sx={{ fontWeight: 850 }}>{plan.config.teamsCount} squadre / {plan.groups.groupCount} gironi</Typography>
      <Typography>Dimensioni gironi: {plan.groups.groupSizes.join(' / ')}</Typography>
      <Typography>Partite per girone: {plan.groups.groupMatchCounts.join(' / ')}</Typography>
      <Typography>Partite per squadra, per girone: {plan.groups.matchesPerTeam.join(' / ')}</Typography>
      <Typography sx={{ mt: 1, fontWeight: 800 }}>{plan.totalGroupMatches} partite nei gironi</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, my: 3 }}>
        {([['Gold', plan.goldBracket], ['Silver', plan.silverBracket]] as const).map(([name, bracket]) => <Paper component="section" aria-label={`${name} bracket`} key={name} sx={{ p: 2 }}>
          <Typography variant="h3" sx={{ mb: 1 }}>{name}</Typography>
          {bracket.qualifiedTeams === 0 ? <Typography color="text.secondary">Nessuna qualificata / tabellone disattivato</Typography> : <>
            <Typography>{bracket.qualifiedTeams} qualificate</Typography>
            <Typography>{bracket.bracketSize} posti nel tabellone</Typography>
            <Typography>{bracket.byeCount} BYE</Typography>
            <Typography>{bracket.matchesPlayed} partite a eliminazione diretta</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>{bracket.roundLabels.join(' → ')}</Typography>
          </>}
        </Paper>)}
      </Box>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
        <Chip label={`${plan.eliminatedCount} teams eliminated after gironi`} />
        <Chip color="primary" label={`${plan.totalTournamentMatches} partite totali del torneo`} />
      </Stack>
      <Typography>Consigliati: {plan.recommendedCourts} campi, uno per girone</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, fontSize: 13 }}>I BYE fanno avanzare automaticamente una squadra e non contano come partite giocate. Qui non vengono generati calendario o classifica.</Typography>
    </>}
  </Paper>
}
