import { useEffect, useState } from 'react'
import { Typography } from '@mui/material'
import type { Match, Tournament } from '../types/domain'

export function MatchTimer({ match, tournament }: { match: Match; tournament: Tournament }) {
  const [now, setNow] = useState(() => Date.now())
  const start = tournament.matchEvents.find(event => event.matchId === match.id && event.type === 'MATCH_STARTED')?.createdAt
  const end = tournament.matchEvents.find(event => event.matchId === match.id && event.type === 'MATCH_COMPLETED')?.createdAt
  useEffect(() => {
    if (!start || match.status === 'completed') return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [start, match.status])
  const seconds = start && (match.status !== 'completed' || end)
    ? Math.max(0, Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000)) : NaN
  const value = Number.isFinite(seconds) ? `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}` : '—'
  return <Typography component="p" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'text.secondary' }}>Durata partita · {value}</Typography>
}
