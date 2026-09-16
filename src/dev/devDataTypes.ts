export type Composition = 'male' | 'female' | 'mixed'
export type MockPlayer = Readonly<{ id: string; firstName: string; lastName: string; gender: 'male' | 'female' }>
export type MockTeam = Readonly<{ id: string; name: string; players: readonly MockPlayer[]; composition: Composition }>
export type SeedOptions = { tournamentId: string; count: number; mode: 'random' | 'deterministic'; seed?: string; filter?: Composition | 'all' | 'balanced' }
