import { describe, expect, it } from 'vitest'
import { createDemoTournament } from '../../demo/demoSeed'
import {
  RESET_CONFIRMATION_PHRASE,
  calculateBackupChecksum,
  confirmTournamentReset,
  createTournamentBackup,
  prepareTournamentRestore,
  requestTournamentReset,
  validateTournamentBackup,
  type TournamentBackupPayload,
} from './tournamentBackup'
import type { Tournament } from '../../shared/types/domain'

describe('tournament backup and recovery', () => {
  it('contains only the requested tournament data', async () => {
    const selected = createDemoTournament()
    const other = createOtherTournament()
    const backup = await createTournamentBackup({
      tournaments: [selected, other],
      tournamentId: selected.id,
      exportedAt: new Date('2026-09-04T10:00:00.000Z'),
    })

    expect(backup.tournamentId).toBe(selected.id)
    expect(backup.teams.map((team) => team.id)).not.toContain(other.teams[0].id)
    expect(backup.matches.map((match) => match.id)).not.toContain(other.matches[0].id)
  })

  it('uses schema version 1', async () => {
    const backup = await createTournamentBackup({ tournaments: [createDemoTournament()], tournamentId: 'demo-tournament' })

    expect(backup.schemaVersion).toBe(1)
  })

  it('generates a valid checksum', async () => {
    const backup = await createTournamentBackup({ tournaments: [createDemoTournament()], tournamentId: 'demo-tournament' })
    const payload = { ...backup } as Partial<typeof backup>
    delete payload.checksum

    await expect(calculateBackupChecksum(payload as TournamentBackupPayload)).resolves.toBe(backup.checksum)
  })

  it('rejects a modified payload checksum', async () => {
    const backup = await createTournamentBackup({ tournaments: [createDemoTournament()], tournamentId: 'demo-tournament' })
    const modified = { ...backup, tournamentName: 'Changed after export' }

    await expect(validateTournamentBackup(modified)).rejects.toThrow('Backup checksum mismatch')
  })

  it('validates backup shape with zod', async () => {
    await expect(validateTournamentBackup({ schemaVersion: 1, checksum: 'not-a-checksum' })).rejects.toThrow()
  })

  it('blocks reset while tournament is live', () => {
    const result = requestTournamentReset({ tournamentStatus: 'live', hasRecentBackup: true, isAdmin: true, reauthRequired: false })

    expect(result.allowed).toBe(false)
    expect(result.reasons).toContain('Tournament must be completed or archived.')
  })

  it('blocks reset without a recent backup', () => {
    const result = requestTournamentReset({ tournamentStatus: 'completed', hasRecentBackup: false, isAdmin: true, reauthRequired: false })

    expect(result.allowed).toBe(false)
    expect(result.reasons).toContain('Recent valid backup required.')
  })

  it('blocks reset for non-admin callers', () => {
    const result = requestTournamentReset({ tournamentStatus: 'completed', hasRecentBackup: true, isAdmin: false, reauthRequired: false })

    expect(result.allowed).toBe(false)
    expect(result.reasons).toContain('Admin role required.')
  })

  it('requires final reset safety confirmations', () => {
    const result = confirmTournamentReset({
      tournamentStatus: 'completed',
      hasRecentBackup: true,
      isAdmin: true,
      confirmationPhrase: RESET_CONFIRMATION_PHRASE,
      reauthenticated: true,
      countdownCompleted: true,
    })

    expect(result.allowed).toBe(true)
  })

  it('rejects unknown schema versions', async () => {
    const backup = await createTournamentBackup({ tournaments: [createDemoTournament()], tournamentId: 'demo-tournament' })

    await expect(validateTournamentBackup({ ...backup, schemaVersion: 999 })).rejects.toThrow()
  })

  it('rejects restore with checksum mismatch', async () => {
    const backup = await createTournamentBackup({ tournaments: [createDemoTournament()], tournamentId: 'demo-tournament' })

    await expect(prepareTournamentRestore({ backupJson: { ...backup, checksum: '0'.repeat(64) }, existingTournaments: [] })).rejects.toThrow('Backup checksum mismatch')
  })

  it('prepares restore preserving relationships and UUIDs', async () => {
    const tournament = createDemoTournament()
    const backup = await createTournamentBackup({ tournaments: [tournament], tournamentId: tournament.id })
    const plan = await prepareTournamentRestore({ backupJson: JSON.stringify(backup), existingTournaments: [tournament] })

    expect(plan.preserveOriginalIds).toBe(true)
    expect(plan.backup.matches[0].teamAId).toBe(tournament.matches[0].teamAId)
    expect(plan.recordCounts.matches).toBe(tournament.matches.length)
  })

  it('detects UUID collisions outside the restored tournament', async () => {
    const backup = await createTournamentBackup({ tournaments: [createDemoTournament()], tournamentId: 'demo-tournament' })
    const collidingTournament = createOtherTournament({ idOverride: backup.matches[0].id })

    await expect(prepareTournamentRestore({ backupJson: backup, existingTournaments: [collidingTournament] })).rejects.toThrow('UUID collision detected')
  })
})

function createOtherTournament(options: { idOverride?: string } = {}): Tournament {
  const tournament = createDemoTournament()
  return {
    ...tournament,
    id: 'other-tournament',
    name: 'OTHER',
    groups: tournament.groups.map((group) => ({ ...group, id: `other-${group.id}` })),
    courts: tournament.courts.map((court) => ({ ...court, id: `other-${court.id}` })),
    rounds: tournament.rounds?.map((round) => ({ ...round, id: `other-${round.id}`, tournamentId: 'other-tournament' })),
    teams: tournament.teams.map((team) => ({
      ...team,
      id: `other-${team.id}`,
      groupId: `other-${team.groupId}`,
      players: team.players.map((player) => ({ ...player, id: `other-${player.id}` })),
    })),
    matches: tournament.matches.map((match, index) => ({
      ...match,
      id: index === 0 && options.idOverride ? options.idOverride : `other-${match.id}`,
      roundId: match.roundId ? `other-${match.roundId}` : undefined,
      courtId: `other-${match.courtId}`,
      groupId: `other-${match.groupId}`,
      teamAId: `other-${match.teamAId}`,
      teamBId: `other-${match.teamBId}`,
      lineups: match.lineups.map((lineup) => ({
        ...lineup,
        teamId: `other-${lineup.teamId}`,
        activePlayerIds: [`other-${lineup.activePlayerIds[0]}`, `other-${lineup.activePlayerIds[1]}`],
        benchPlayerId: `other-${lineup.benchPlayerId}`,
      })),
    })),
    cards: tournament.cards.map((card) => ({ ...card, id: `other-${card.id}` })),
    teamCards: tournament.teamCards.map((card) => ({ ...card, id: `other-${card.id}`, teamId: `other-${card.teamId}`, cardId: `other-${card.cardId}`, matchId: card.matchId ? `other-${card.matchId}` : undefined })),
    kaosEvents: [],
    matchEvents: tournament.matchEvents.map((event) => ({ ...event, id: `other-${event.id}`, matchId: `other-${event.matchId}` })),
    globalEvents: tournament.globalEvents.map((event) => ({ ...event, id: `other-${event.id}` })),
  }
}
