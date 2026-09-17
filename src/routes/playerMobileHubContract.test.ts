/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/features/player/TeamMobileApp.tsx', 'utf8')

describe('Team mobile match hub contract', () => {
  it('uses single-column mobile sections and large primary touch targets', () => {
    expect(source).toContain('pb-[calc(6.5rem+env(safe-area-inset-bottom))]')
    expect(source).toContain('min-h-12 w-full')
    expect(source).toContain('fixed inset-x-0 bottom-0')
    expect(source).not.toContain('overflow-x-auto')
  })

  it('opens Cards as a dedicated action and exposes readable long details without technical fields', () => {
    expect(source).toContain('onOpenCards')
    expect(source).toContain('grid-cols-4')
    expect(source).toContain('Seleziona carta')
    expect(source).toContain('Torna alla mano')
    expect(source).toContain('data-card-experience="fullscreen"')
    expect(source).toContain('detail.definition.longDescription || detail.definition.description')
    expect(source).toContain('object-contain')
    expect(source).not.toContain('object-cover')
    expect(source).not.toContain('effectType}</')
    expect(source).not.toContain('targetType}</')
  })

  it('presents real standings and only Team-scoped upcoming matches', () => {
    expect(source).toContain('groupStandings(tournament, team.groupId)')
    expect(source).toContain("matches.filter(match => match.status !== 'completed')")
    expect(source).toContain('Pos.')
    expect(source).toContain('Partite della squadra')
  })

  it('keeps match selection scoped and exposes both persisted set lineups', () => {
    expect(source).toContain('matches.map(item =>')
    expect(source).toContain('getOwnMatchCards(cards, playerTeam.id, match.id)')
    expect(source).toContain('La tua formazione')
    expect(source).toContain('Formazione avversaria')
    expect(source).toContain('Formazione avversaria non ancora disponibile')
    expect(source).toContain('isSuperTieBreakRequired(match) ? [1, 2, 3] : [1, 2]')
  })

  it('keeps historical lineups secondary and card action copy stable', () => {
    expect(source).toContain('Vedi formazioni')
    expect(source).toContain('ResultsLineupDetails')
    expect(source).toContain('Formazione avversaria non disponibile')
    expect(source).toContain('>Utilizza</button>')
    expect(source).not.toContain('Gioca carta')
    expect(source).not.toContain('Utilizzo non ancora disponibile')
  })
})
