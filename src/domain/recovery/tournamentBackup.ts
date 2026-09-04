import { z } from 'zod'
import type { CardDefinition, GlobalEvent, Match, MatchEvent, MatchLineup, Round, Team, TeamCard, Tournament } from '../../shared/types/domain'

export const TOURNAMENT_BACKUP_SCHEMA_VERSION = 1
export const RESET_CONFIRMATION_PHRASE = 'RESET PADEL KAOS'
export const BACKUP_RETENTION_HOURS = 48

export type TournamentLifecycleStatus = 'draft' | 'configured' | 'live' | 'completed' | 'archived'
export type TournamentBackupType = 'manual_export' | 'server_snapshot'

export type TournamentBackupPayload = {
  schemaVersion: typeof TOURNAMENT_BACKUP_SCHEMA_VERSION
  appVersion: string
  backupType: TournamentBackupType
  tournamentId: string
  tournamentName: string
  exportedAt: string
  tournament: Pick<Tournament, 'id' | 'name' | 'phase'> & { status?: TournamentLifecycleStatus }
  groups: Tournament['groups']
  courts: Tournament['courts']
  rounds: Round[]
  teams: Team[]
  players: Array<Team['players'][number] & { teamId: string }>
  matches: Match[]
  lineups: MatchLineup[]
  cardDefinitionsSnapshot: CardDefinition[]
  matchCards: TeamCard[]
  globalEvents: GlobalEvent[]
  tournamentEvents: MatchEvent[]
}

export type TournamentBackup = TournamentBackupPayload & {
  checksum: string
}

export type CreateTournamentBackupInput = {
  tournaments: Tournament[]
  tournamentId: string
  appVersion?: string
  exportedAt?: Date
  backupType?: TournamentBackupType
  status?: TournamentLifecycleStatus
}

export type ResetRequestInput = {
  tournamentStatus: TournamentLifecycleStatus
  hasRecentBackup: boolean
  isAdmin: boolean
  reauthRequired?: boolean
}

export type ResetConfirmationInput = ResetRequestInput & {
  confirmationPhrase: string
  reauthenticated: boolean
  countdownCompleted: boolean
}

export type ResetGateResult = {
  allowed: boolean
  reasons: string[]
}

export type RestorePlan = {
  backup: TournamentBackup
  preserveOriginalIds: true
  recordCounts: Record<keyof Pick<TournamentBackupPayload, 'groups' | 'courts' | 'rounds' | 'teams' | 'players' | 'matches' | 'lineups' | 'cardDefinitionsSnapshot' | 'matchCards' | 'globalEvents' | 'tournamentEvents'>, number>
}

const lifecycleStatusSchema = z.enum(['draft', 'configured', 'live', 'completed', 'archived'])
const backupTypeSchema = z.enum(['manual_export', 'server_snapshot'])

const entityWithIdSchema = z.object({ id: z.string().min(1) }).passthrough()
const playerSchema = entityWithIdSchema.extend({ teamId: z.string().min(1) }).passthrough()
const matchSchema = entityWithIdSchema.extend({
  courtId: z.string().min(1),
  groupId: z.string().min(1),
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
}).passthrough()
const lineupSchema = z.object({
  teamId: z.string().min(1),
  setNumber: z.number(),
  activePlayerIds: z.tuple([z.string().min(1), z.string().min(1)]),
  benchPlayerId: z.string().min(1),
}).passthrough()
const teamCardSchema = entityWithIdSchema.extend({
  teamId: z.string().min(1),
  cardId: z.string().min(1),
}).passthrough()
const tournamentBackupSchema = z.object({
  schemaVersion: z.literal(TOURNAMENT_BACKUP_SCHEMA_VERSION),
  appVersion: z.string().min(1),
  backupType: backupTypeSchema,
  tournamentId: z.string().min(1),
  tournamentName: z.string().min(1),
  exportedAt: z.string().datetime(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  tournament: entityWithIdSchema.extend({
    name: z.string().min(1),
    status: lifecycleStatusSchema.optional(),
  }),
  groups: z.array(entityWithIdSchema),
  courts: z.array(entityWithIdSchema),
  rounds: z.array(entityWithIdSchema),
  teams: z.array(entityWithIdSchema.extend({ groupId: z.string().min(1) })),
  players: z.array(playerSchema),
  matches: z.array(matchSchema),
  lineups: z.array(lineupSchema),
  cardDefinitionsSnapshot: z.array(entityWithIdSchema),
  matchCards: z.array(teamCardSchema),
  globalEvents: z.array(entityWithIdSchema),
  tournamentEvents: z.array(entityWithIdSchema),
})

export async function createTournamentBackup(input: CreateTournamentBackupInput): Promise<TournamentBackup> {
  const tournament = input.tournaments.find((item) => item.id === input.tournamentId)
  if (!tournament) {
    throw new Error('Tournament not found')
  }

  const matchIds = new Set(tournament.matches.map((match) => match.id))
  const teamIds = new Set(tournament.teams.map((team) => team.id))
  const payload: TournamentBackupPayload = {
    schemaVersion: TOURNAMENT_BACKUP_SCHEMA_VERSION,
    appVersion: input.appVersion ?? '0.0.0',
    backupType: input.backupType ?? 'manual_export',
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    tournament: {
      id: tournament.id,
      name: tournament.name,
      phase: tournament.phase,
      status: input.status,
    },
    groups: [...tournament.groups],
    courts: [...tournament.courts],
    rounds: [...(tournament.rounds ?? [])],
    teams: tournament.teams.map((team) => ({ ...team, players: [...team.players] })),
    players: tournament.teams.flatMap((team) => team.players.map((player) => ({ ...player, teamId: team.id }))),
    matches: tournament.matches.map((match) => ({ ...match, lineups: [...match.lineups], activeCardUsageIds: [...match.activeCardUsageIds] })),
    lineups: tournament.matches.flatMap((match) => match.lineups.map((lineup) => ({ ...lineup }))),
    cardDefinitionsSnapshot: tournament.cards.filter((card) => card.enabled).map((card) => ({ ...card })),
    matchCards: tournament.teamCards.filter((card) => teamIds.has(card.teamId) && (!card.matchId || matchIds.has(card.matchId))).map((card) => ({ ...card })),
    globalEvents: tournament.globalEvents.map((event) => ({ ...event })),
    tournamentEvents: tournament.matchEvents.filter((event) => !event.matchId || matchIds.has(event.matchId)).map((event) => ({ ...event })),
  }

  return {
    ...payload,
    checksum: await calculateBackupChecksum(payload),
  }
}

export async function validateTournamentBackup(candidate: unknown): Promise<TournamentBackup> {
  const backup = tournamentBackupSchema.parse(candidate) as TournamentBackup
  const expectedChecksum = await calculateBackupChecksum(withoutChecksum(backup))
  if (backup.checksum !== expectedChecksum) {
    throw new Error('Backup checksum mismatch')
  }
  validateLogicalReferences(backup)
  return backup
}

export async function prepareTournamentRestore(input: {
  backupJson: string | unknown
  existingTournaments: Tournament[]
}): Promise<RestorePlan> {
  const parsed = typeof input.backupJson === 'string' ? JSON.parse(input.backupJson) : input.backupJson
  const backup = await validateTournamentBackup(parsed)
  const collisions = detectUuidCollisions(backup, input.existingTournaments)
  if (collisions.length > 0) {
    throw new Error(`UUID collision detected: ${collisions.join(', ')}`)
  }

  return {
    backup,
    preserveOriginalIds: true,
    recordCounts: {
      groups: backup.groups.length,
      courts: backup.courts.length,
      rounds: backup.rounds.length,
      teams: backup.teams.length,
      players: backup.players.length,
      matches: backup.matches.length,
      lineups: backup.lineups.length,
      cardDefinitionsSnapshot: backup.cardDefinitionsSnapshot.length,
      matchCards: backup.matchCards.length,
      globalEvents: backup.globalEvents.length,
      tournamentEvents: backup.tournamentEvents.length,
    },
  }
}

export function requestTournamentReset(input: ResetRequestInput): ResetGateResult {
  const reasons: string[] = []
  if (!input.isAdmin) reasons.push('Admin role required.')
  if (!['completed', 'archived'].includes(input.tournamentStatus)) reasons.push('Tournament must be completed or archived.')
  if (!input.hasRecentBackup) reasons.push('Recent valid backup required.')
  if (input.reauthRequired ?? true) reasons.push('Admin re-authentication required before final confirmation.')

  return { allowed: reasons.length === 0, reasons }
}

export function confirmTournamentReset(input: ResetConfirmationInput): ResetGateResult {
  const base = requestTournamentReset({ ...input, reauthRequired: false })
  const reasons = [...base.reasons]
  if (!input.reauthenticated) reasons.push('Admin re-authentication is missing.')
  if (input.confirmationPhrase !== RESET_CONFIRMATION_PHRASE) reasons.push('Confirmation phrase does not match.')
  if (!input.countdownCompleted) reasons.push('Safety countdown is not complete.')

  return { allowed: reasons.length === 0, reasons }
}

export function buildBackupFileName(backup: Pick<TournamentBackup, 'exportedAt' | 'tournamentName'>) {
  const date = backup.exportedAt.slice(0, 10)
  const tournament = backup.tournamentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tournament'
  return `padel-kaos-${date}-${tournament}.json`
}

export function detectUuidCollisions(backup: TournamentBackup, existingTournaments: Tournament[]) {
  const existingIds = new Set(
    existingTournaments
      .filter((tournament) => tournament.id !== backup.tournamentId)
      .flatMap((tournament) => [
        tournament.id,
        ...tournament.groups.map((group) => group.id),
        ...tournament.courts.map((court) => court.id),
        ...(tournament.rounds ?? []).map((round) => round.id),
        ...tournament.teams.flatMap((team) => [team.id, ...team.players.map((player) => player.id)]),
        ...tournament.matches.map((match) => match.id),
        ...tournament.cards.map((card) => card.id),
        ...tournament.teamCards.map((card) => card.id),
        ...tournament.globalEvents.map((event) => event.id),
        ...tournament.matchEvents.map((event) => event.id),
      ]),
  )

  return collectBackupIds(backup).filter((id, index, ids) => existingIds.has(id) && ids.indexOf(id) === index)
}

export async function calculateBackupChecksum(payload: TournamentBackupPayload) {
  const data = new TextEncoder().encode(stableStringify(payload))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function withoutChecksum(backup: TournamentBackup): TournamentBackupPayload {
  const payload = { ...backup } as Partial<TournamentBackup>
  delete payload.checksum
  return payload as TournamentBackupPayload
}

function validateLogicalReferences(backup: TournamentBackup) {
  const groupIds = new Set(backup.groups.map((group) => group.id))
  const courtIds = new Set(backup.courts.map((court) => court.id))
  const roundIds = new Set(backup.rounds.map((round) => round.id))
  const teamIds = new Set(backup.teams.map((team) => team.id))
  const playerIds = new Set(backup.players.map((player) => player.id))
  const matchIds = new Set(backup.matches.map((match) => match.id))
  const cardIds = new Set(backup.cardDefinitionsSnapshot.map((card) => card.id))

  for (const team of backup.teams) {
    if (!groupIds.has(team.groupId)) throw new Error(`Team ${team.id} references an unknown group.`)
  }
  for (const player of backup.players) {
    if (!teamIds.has(player.teamId)) throw new Error(`Player ${player.id} references an unknown team.`)
  }
  for (const match of backup.matches) {
    if (!teamIds.has(match.teamAId) || !teamIds.has(match.teamBId)) throw new Error(`Match ${match.id} references an unknown team.`)
    if (!courtIds.has(match.courtId)) throw new Error(`Match ${match.id} references an unknown court.`)
    if (!groupIds.has(match.groupId)) throw new Error(`Match ${match.id} references an unknown group.`)
    if (match.roundId && !roundIds.has(match.roundId)) throw new Error(`Match ${match.id} references an unknown round.`)
  }
  for (const lineup of backup.lineups) {
    if (!teamIds.has(lineup.teamId)) throw new Error(`Lineup references an unknown team.`)
    if (!lineup.activePlayerIds.every((id) => playerIds.has(id)) || !playerIds.has(lineup.benchPlayerId)) {
      throw new Error(`Lineup references an unknown player.`)
    }
  }
  for (const card of backup.matchCards) {
    if (!teamIds.has(card.teamId)) throw new Error(`Match card ${card.id} references an unknown team.`)
    if (!cardIds.has(card.cardId)) throw new Error(`Match card ${card.id} references an unknown card definition.`)
    if (card.matchId && !matchIds.has(card.matchId)) throw new Error(`Match card ${card.id} references an unknown match.`)
  }
}

function collectBackupIds(backup: TournamentBackup) {
  return [
    backup.tournamentId,
    ...backup.groups.map((group) => group.id),
    ...backup.courts.map((court) => court.id),
    ...backup.rounds.map((round) => round.id),
    ...backup.teams.map((team) => team.id),
    ...backup.players.map((player) => player.id),
    ...backup.matches.map((match) => match.id),
    ...backup.cardDefinitionsSnapshot.map((card) => card.id),
    ...backup.matchCards.map((card) => card.id),
    ...backup.globalEvents.map((event) => event.id),
    ...backup.tournamentEvents.map((event) => event.id),
  ]
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}
