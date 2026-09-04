import { motion } from 'framer-motion'
import type { Match, Team } from '../types/domain'
import { formatPoint } from '../../domain/scoring/scoreEngine'

export function Scoreboard({
  match,
  teamA,
  teamB,
  compact = false,
}: {
  match: Match
  teamA?: Team
  teamB?: Team
  compact?: boolean
}) {
  return (
    <div className="grid overflow-hidden rounded border border-white/10 bg-[#171717]">
      <TeamScoreRow side="A" team={teamA} match={match} compact={compact} />
      <div className="h-px bg-white/10" />
      <TeamScoreRow side="B" team={teamB} match={match} compact={compact} />
    </div>
  )
}

function TeamScoreRow({
  side,
  team,
  match,
  compact,
}: {
  side: 'A' | 'B'
  team?: Team
  match: Match
  compact: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black uppercase">{team?.name ?? 'TBD'}</p>
        <p className="text-xs text-white/50">{team?.shortName ?? side}</p>
      </div>
      <ScoreCell label="SET" value={match.score.sets[side]} />
      <ScoreCell label="GAME" value={match.score.games[side]} />
      <motion.div
        key={`${side}-${match.score.points[side]}`}
        initial={{ scale: 0.9, opacity: 0.35 }}
        animate={{ scale: 1, opacity: 1 }}
        className={compact ? 'w-14 text-right text-3xl font-black' : 'w-20 text-right text-5xl font-black'}
        style={{ color: team?.color ?? '#FFD000' }}
      >
        {formatPoint(match.score.points[side])}
      </motion.div>
    </div>
  )
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-12 text-center">
      <p className="text-[10px] font-bold text-white/35">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  )
}
