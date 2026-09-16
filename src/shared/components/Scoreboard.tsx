import { motion } from 'framer-motion'
import { Box, Paper, Stack, Typography } from '@mui/material'
import type { Match, Team } from '../types/domain'
import { formatPoint } from '../../domain/scoring/scoreEngine'
import { scoreTypography } from '../../theme/typography'
import { StatusChip } from './Foundation'
export function Scoreboard({ match, teamA, teamB, compact = false, display = false }: { match: Match; teamA?: Team; teamB?: Team; compact?: boolean; display?: boolean }) {
  return <Paper className="scoreboard" sx={{ overflow: 'hidden', background: 'var(--event-gradient)' }}>
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', gap: 1 }}>
      <Typography sx={{ fontWeight: 800, fontSize: display ? 'clamp(1rem, 1.8vw, 2rem)' : 12 }}>SET {match.score.currentSet}</Typography>
      <StatusChip label={match.status} />
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: display ? '1fr 1fr' : '1fr' }}>{(['A', 'B'] as const).map((side, index) => {
      const team = index === 0 ? teamA : teamB
      return <Box key={side} sx={{ display: 'grid', gridTemplateColumns: display ? '1fr' : 'minmax(0, 1fr) auto auto auto', alignItems: 'center', textAlign: display ? 'center' : 'left', gap: { xs: 1, sm: 2 }, p: display ? 3 : 2, borderTop: !display && index ? 1 : 0, borderColor: 'divider' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 900, overflowWrap: 'anywhere', fontSize: display ? 'clamp(1.3rem, 3vw, 4rem)' : compact ? 13 : 16 }}>{team?.name ?? 'TBD'}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 12 }}>{team?.shortName ?? side}</Typography>
        </Box>{!display && <>
          <ScoreCell label="SET" value={match.score.sets[side]} />
          <ScoreCell label="GAME" value={match.score.games[side]} />
        </>}<Box component={motion.div} key={match.score.points[side]} initial={{ scale: .9, opacity: .5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .2 }} aria-label={side + ' points'} sx={{ ...scoreTypography, minWidth: compact ? 48 : 64, color: index ? 'text.primary' : 'primary.main', fontSize: display ? 'clamp(4rem, 12vw, 12rem)' : compact ? '2.5rem' : '3.5rem', textAlign: display ? 'center' : 'right' }}>{formatPoint(match.score.points[side])}</Box>{display && <Typography sx={{ fontSize: 'clamp(1.2rem, 2.5vw, 3rem)', fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>{match.score.sets[side]} SET / {match.score.games[side]} GAME</Typography>}</Box>
    })}</Box>
  </Paper>
}
function ScoreCell({ label, value }: { label: string; value: number }) {
  return <Box sx={{ minWidth: 28, textAlign: 'center' }}>
    <Typography color="text.secondary" sx={{ fontSize: 10 }}>{label}</Typography>
    <Typography sx={{ ...scoreTypography, fontSize: 22 }}>{value}</Typography>
  </Box>
}
