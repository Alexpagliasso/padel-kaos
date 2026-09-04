import { useState } from 'react'
import { KeyRound, UsersRound } from 'lucide-react'
import { credentialsToCsv, provisionTeamAccounts, provisionTournamentUser, type ProvisionedCredential } from '../../services/supabase/provisioning'
import { downloadTextFile } from '../../shared/lib/downloadTextFile'
import type { Tournament } from '../../shared/types/domain'
import type { ProvisionableRole } from './authIdentity'

export function AccessManagementPanel({ tournament }: { tournament: Tournament }) {
  const [role, setRole] = useState<ProvisionableRole>('team')
  const [username, setUsername] = useState('')
  const [assignmentId, setAssignmentId] = useState('')
  const [lastCredentials, setLastCredentials] = useState<ProvisionedCredential[]>([])
  const [message, setMessage] = useState('')

  const assignmentOptions = role === 'team' ? tournament.teams : role === 'referee' || role === 'court_display' ? tournament.courts : []

  async function createLogin() {
    setMessage('')
    const credential = await provisionTournamentUser({
      tournamentId: tournament.id,
      username,
      role,
      teamId: role === 'team' ? assignmentId : undefined,
      courtId: role === 'referee' || role === 'court_display' ? assignmentId : undefined,
    })
    setLastCredentials([credential])
    setMessage('Login created. Save the temporary password now.')
  }

  async function createBulkTeamLogins() {
    setMessage('')
    const credentials = await provisionTeamAccounts({
      tournamentId: tournament.id,
      teams: tournament.teams.map((team) => ({ id: team.id, name: team.name, shortName: team.shortName })),
    })
    setLastCredentials(credentials)
    downloadTextFile('padel-kaos-team-credentials.csv', credentialsToCsv(credentials), 'text/csv')
    setMessage('Team credentials generated and downloaded.')
  }

  return (
    <section className="rounded border border-white/10 bg-[#171717] p-5">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="size-5 text-[#FFD000]" />
        <h2 className="text-lg font-black">Access Management</h2>
      </div>
      <div className="grid gap-2">
        <select className="rounded bg-black px-3 py-3" value={role} onChange={(event) => setRole(event.target.value as ProvisionableRole)}>
          <option value="team">Team Login</option>
          <option value="referee">Referee Login</option>
          <option value="court_display">Court Display Login</option>
          <option value="main_display">Main Display Login</option>
        </select>
        <input className="rounded bg-black px-3 py-3" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
        {assignmentOptions.length > 0 ? (
          <select className="rounded bg-black px-3 py-3" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
            <option value="">Assignment</option>
            {assignmentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : null}
        <button className="inline-flex items-center justify-center gap-2 rounded bg-white px-3 py-3 font-black text-black" onClick={createLogin}>
          <KeyRound className="size-4" />
          Create Login
        </button>
        <button className="inline-flex items-center justify-center gap-2 rounded bg-[#FFD000] px-3 py-3 font-black text-black" onClick={createBulkTeamLogins}>
          <UsersRound className="size-4" />
          Generate Team Accounts
        </button>
      </div>
      {message ? <p className="mt-3 text-sm font-bold text-white/60">{message}</p> : null}
      {lastCredentials.length > 0 ? (
        <div className="mt-4 max-h-48 overflow-auto rounded bg-black p-3 text-xs">
          {lastCredentials.map((credential) => (
            <p key={`${credential.role}-${credential.username}`} className="font-mono">
              {credential.role} {credential.username} {credential.temporaryPassword ?? ''}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}
