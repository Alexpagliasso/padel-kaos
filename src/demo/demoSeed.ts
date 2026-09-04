import { createInitialScore } from '../domain/scoring/scoreEngine'
import type { CardDefinition, DiceRule, Player, Team, Tournament } from '../shared/types/domain'

const groups = [
  { id: 'demo-group-a', name: 'Demo Group' },
]

const courts = [
  { id: 'court-1', name: 'COURT 1' },
  { id: 'court-2', name: 'COURT 2' },
]

const teams: Team[] = [
  createTeam('team-red', 'TEAM RED', 'RED', '#FF405C', [
    ['Mario Rossi', 'man'],
    ['Giulia Ferri', 'woman'],
    ['Leo Costa', 'man'],
  ]),
  createTeam('team-blue', 'TEAM BLUE', 'BLUE', '#00D1FF', [
    ['Sara Conti', 'woman'],
    ['Nina Belli', 'woman'],
    ['Diego Riva', 'man'],
  ]),
  createTeam('team-yellow', 'TEAM YELLOW', 'YELL', '#FFD000', [
    ['Luca Neri', 'man'],
    ['Marco Villa', 'man'],
    ['Elena Mori', 'woman'],
  ]),
  createTeam('team-black', 'TEAM BLACK', 'BLK', '#B8B8B8', [
    ['Ruben Sala', 'man'],
    ['Alma Fonti', 'woman'],
    ['Tom Greco', 'man'],
  ]),
]

export const demoCards: CardDefinition[] = [
  {
    id: 'card-power-point',
    name: 'POWER POINT',
    slug: 'power-point',
    description: 'Il prossimo rally vinto dalla squadra vale due progressioni di punteggio.',
    category: 'bonus',
    target: 'own_team',
    activationTiming: 'before_point',
    durationType: 'point',
    durationValue: 1,
    effectType: 'power_point',
    targetType: 'own_team',
    canBeStolen: true,
    isGlobal: false,
    enabled: true,
  },
  {
    id: 'card-blackout',
    name: 'BLACKOUT',
    slug: 'blackout',
    description: 'Effetto speciale demo: overlay immediato su court e main display.',
    category: 'kaos',
    target: 'match',
    activationTiming: 'anytime',
    durationType: 'point',
    durationValue: 1,
    effectType: 'blackout_overlay',
    targetType: 'match',
    canBeStolen: false,
    isGlobal: false,
    enabled: true,
  },
  {
    id: 'card-steal',
    name: 'STEAL',
    slug: 'steal',
    description: 'Ruba un vantaggio agli avversari nella narrativa demo.',
    category: 'malus',
    target: 'opponent',
    activationTiming: 'between_games',
    durationType: 'game',
    durationValue: 1,
    effectType: 'steal_advantage',
    targetType: 'active_card',
    canBeStolen: false,
    isGlobal: false,
    enabled: true,
  },
  {
    id: 'card-shield',
    name: 'SHIELD',
    slug: 'shield',
    description: 'Annulla un malus nella narrativa demo.',
    category: 'bonus',
    target: 'own_team',
    activationTiming: 'anytime',
    durationType: 'point',
    durationValue: 1,
    effectType: 'shield',
    targetType: 'own_team',
    canBeStolen: true,
    isGlobal: false,
    enabled: true,
  },
]

export const demoDiceRules: DiceRule[] = [
  { id: 'dice-one-vs-one', value: 1, title: 'ONE VS ONE', description: 'Un giocatore per squadra fino al prossimo game.', effectType: 'one_vs_one', durationGames: 1, enabled: true },
  { id: 'dice-golden-point', value: 2, title: 'GOLDEN POINT', description: 'Sul 40-40 decide il punto secco.', effectType: 'golden_point', durationGames: 2, enabled: true },
  { id: 'dice-double-point', value: 3, title: 'DOUBLE POINT', description: 'Ogni rally vale doppio per due game.', effectType: 'double_point', durationGames: 2, enabled: true },
  { id: 'dice-no-smash', value: 4, title: 'NO SMASH', description: 'Smash vietato fino a nuovo game.', effectType: 'no_smash', durationGames: 1, enabled: true },
  { id: 'dice-second-serve', value: 5, title: 'SECOND SERVE ONLY', description: 'Solo seconda di servizio.', effectType: 'second_serve_only', durationGames: 1, enabled: true },
  { id: 'dice-super-kaos', value: 6, title: 'SUPER KAOS', description: 'Il pubblico sceglie una regola speciale.', effectType: 'super_kaos', enabled: true },
]

export function createDemoTournament(): Tournament {
  return {
    id: 'demo-tournament',
    name: 'PADEL KAOS DEMO',
    phase: 'GROUP_STAGE',
    groups,
    courts,
    rounds: [
      {
        id: 'round-demo-1',
        tournamentId: 'demo-tournament',
        name: 'ROUND 1',
        stage: 'group',
        sequence: 1,
        status: 'scheduled',
      },
    ],
    teams,
    matches: [
      {
        id: 'match-demo-1',
        roundId: 'round-demo-1',
        courtId: 'court-1',
        groupId: 'demo-group-a',
        teamAId: 'team-red',
        teamBId: 'team-blue',
        status: 'ready',
        score: createInitialScore({ gameStartingScore: { teamA: 0, teamB: 1 } }),
        lineups: [
          { teamId: 'team-red', setNumber: 1, activePlayerIds: ['team-red-p1', 'team-red-p2'], benchPlayerId: 'team-red-p3' },
          { teamId: 'team-blue', setNumber: 1, activePlayerIds: ['team-blue-p1', 'team-blue-p2'], benchPlayerId: 'team-blue-p3' },
        ],
        activeCardUsageIds: [],
      },
      {
        id: 'match-demo-2',
        roundId: 'round-demo-1',
        courtId: 'court-2',
        groupId: 'demo-group-a',
        teamAId: 'team-yellow',
        teamBId: 'team-black',
        status: 'ready',
        score: createInitialScore({ gameStartingScore: { teamA: 0, teamB: 0 } }),
        lineups: [
          { teamId: 'team-yellow', setNumber: 1, activePlayerIds: ['team-yellow-p1', 'team-yellow-p3'], benchPlayerId: 'team-yellow-p2' },
          { teamId: 'team-black', setNumber: 1, activePlayerIds: ['team-black-p1', 'team-black-p2'], benchPlayerId: 'team-black-p3' },
        ],
        activeCardUsageIds: [],
      },
    ],
    cards: demoCards,
    teamCards: [
      { id: 'tc-red-power', teamId: 'team-red', cardId: 'card-power-point', matchId: 'match-demo-1', state: 'available' },
      { id: 'tc-red-shield', teamId: 'team-red', cardId: 'card-shield', matchId: 'match-demo-1', state: 'available' },
      { id: 'tc-red-steal', teamId: 'team-red', cardId: 'card-steal', matchId: 'match-demo-1', state: 'available' },
      { id: 'tc-blue-blackout', teamId: 'team-blue', cardId: 'card-blackout', matchId: 'match-demo-1', state: 'available' },
      { id: 'tc-blue-steal', teamId: 'team-blue', cardId: 'card-steal', matchId: 'match-demo-1', state: 'available' },
      { id: 'tc-blue-shield', teamId: 'team-blue', cardId: 'card-shield', matchId: 'match-demo-1', state: 'available' },
      { id: 'tc-yellow-steal', teamId: 'team-yellow', cardId: 'card-steal', matchId: 'match-demo-2', state: 'available' },
      { id: 'tc-yellow-power', teamId: 'team-yellow', cardId: 'card-power-point', matchId: 'match-demo-2', state: 'available' },
      { id: 'tc-yellow-shield', teamId: 'team-yellow', cardId: 'card-shield', matchId: 'match-demo-2', state: 'available' },
      { id: 'tc-black-shield', teamId: 'team-black', cardId: 'card-shield', matchId: 'match-demo-2', state: 'available' },
      { id: 'tc-black-blackout', teamId: 'team-black', cardId: 'card-blackout', matchId: 'match-demo-2', state: 'available' },
      { id: 'tc-black-power', teamId: 'team-black', cardId: 'card-power-point', matchId: 'match-demo-2', state: 'available' },
    ],
    diceRules: demoDiceRules,
    kaosEvents: [],
    matchEvents: [],
    globalEvents: [],
    standings: [
      { teamId: 'team-red', played: 0, won: 0, lost: 0, points: 0 },
      { teamId: 'team-blue', played: 0, won: 0, lost: 0, points: 0 },
      { teamId: 'team-yellow', played: 0, won: 0, lost: 0, points: 0 },
      { teamId: 'team-black', played: 0, won: 0, lost: 0, points: 0 },
    ],
  }
}

function createTeam(
  id: string,
  name: string,
  shortName: string,
  color: string,
  playerSeeds: Array<[string, Player['gender']]>,
): Team {
  return {
    id,
    name,
    shortName,
    color,
    groupId: 'demo-group-a',
    players: playerSeeds.map(([playerName, gender], index) => ({
      id: `${id}-p${index + 1}`,
      name: playerName,
      nickname: playerName.split(' ')[0],
      gender,
      accessToken: `demo_${id}_${index + 1}`,
    })),
  }
}
