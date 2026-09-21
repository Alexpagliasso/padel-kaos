import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Box, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import type { Tournament } from '../../../shared/types/domain'
import { listTournamentProvisionedAccounts, setRefereeCourtAssignment } from '../../../services/supabase/provisioning'
import { requireSupabase } from '../../../services/supabase/client'
import { scheduleKeys } from '../../../repositories/scheduleRepository'

export function RefereeCourtAssignmentsPanel({ tournament }: { tournament: Tournament }) {
  const queryClient = useQueryClient()
  const [savingCourtId, setSavingCourtId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [failure, setFailure] = useState(false)
  const queryKey = ['regia', tournament.id, 'referee-assignments'] as const
  const accountsQuery = useQuery({
    queryKey,
    queryFn: () => listTournamentProvisionedAccounts(tournament.id),
    refetchInterval: 15000,
  })

  useEffect(() => {
    const client = requireSupabase()
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.referees(tournament.id) })
    }
    const channel = client.channel(`regia-referee-assignments:${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referee_court_assignments', filter: `tournament_id=eq.${tournament.id}` }, refresh)
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [queryClient, tournament.id])

  const accounts = accountsQuery.data ?? []
  const referees = accounts.filter(account => account.role === 'referee')
  const assignedTo = (courtId: string) => referees.find(referee => referee.courtIds?.includes(courtId))?.id ?? ''
  const uncovered = tournament.courts.filter(court => !assignedTo(court.id)).length

  async function changeCourt(courtId: string, refereeUserId: string) {
    setSavingCourtId(courtId)
    setFeedback('')
    setFailure(false)
    try {
      await setRefereeCourtAssignment(tournament.id, courtId, refereeUserId || null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: scheduleKeys.referees(tournament.id) }),
      ])
      setFeedback('Assegnazione aggiornata.')
    } catch (cause) {
      setFailure(true)
      setFeedback(cause instanceof Error ? cause.message : 'Assegnazione non riuscita.')
    } finally {
      setSavingCourtId('')
    }
  }

  return <Paper sx={{ p: 3 }}>
    <Typography variant="h3">ARBITRI E CAMPI</Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>Le assegnazioni possono essere aggiornate durante il torneo.</Typography>
    {uncovered > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{uncovered} {uncovered === 1 ? 'CAMPO SENZA ARBITRO' : 'CAMPI SENZA ARBITRO'}</Alert>}
    {accountsQuery.isLoading && <Typography>Caricamento arbitri…</Typography>}
    {accountsQuery.error && <Alert severity="error">Impossibile caricare le assegnazioni.</Alert>}
    {feedback && <Alert severity={failure ? 'error' : 'success'} sx={{ mb: 2 }}>{feedback}</Alert>}
    <Stack spacing={1.5}>
      {tournament.courts.map(court => {
        const group = tournament.groups.find(item => item.assignedCourtId === court.id)
          ?? tournament.groups.find(item => tournament.matches.some(match => match.courtId === court.id && match.groupId === item.id))
        return <Box key={court.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1fr) minmax(180px,1fr)' }, gap: 2, alignItems: 'center' }}>
          <Box><Typography sx={{ fontWeight: 800 }}>{court.name}{group ? ` · ${group.name}` : ''}</Typography>
            {!assignedTo(court.id) && <Typography color="warning.main" sx={{ fontSize: 12, fontWeight: 900 }}>NON ASSEGNATO</Typography>}
          </Box>
          <TextField select size="small" label={`Arbitro per ${court.name}`} value={assignedTo(court.id)}
            disabled={accountsQuery.isLoading || Boolean(accountsQuery.error) || Boolean(savingCourtId)}
            onChange={event => void changeCourt(court.id, event.target.value)}>
            <MenuItem value="">NON ASSEGNATO</MenuItem>
            {referees.map(referee => <MenuItem key={referee.id} value={referee.id}>{referee.displayName || referee.username}</MenuItem>)}
          </TextField>
        </Box>
      })}
    </Stack>
  </Paper>
}
