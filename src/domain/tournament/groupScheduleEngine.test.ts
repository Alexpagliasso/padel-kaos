import { describe, expect, it } from 'vitest'
import { generateGroupStageSchedule, type ScheduleGroupInput } from './groupScheduleEngine'

function group(size: number, index = 0): ScheduleGroupInput {
  return { id: `g-${index}`, name: `Girone ${String.fromCharCode(65 + index)}`, sortOrder: index, assignedCourtId: `c-${index}`, teamIds: Array.from({ length: size }, (_, team) => `g${index}-t${team}`) }
}

function pairsFor(size: number) {
  return generateGroupStageSchedule([group(size)]).flatMap((turn) => turn.matches)
}

describe('group schedule engine', () => {
  it.each([[2, 1], [3, 3], [4, 6], [5, 10], [6, 15]])('%i squadre producono %i partite', (teams, matches) => {
    expect(pairsFor(teams)).toHaveLength(matches)
  })

  it('crea ogni coppia una volta, senza auto-partite', () => {
    const matches = pairsFor(6)
    const keys = matches.map((match) => [match.teamAId, match.teamBId].sort().join(':'))
    expect(matches.every((match) => match.teamAId !== match.teamBId)).toBe(true)
    expect(new Set(keys).size).toBe(15)
  })

  it('è deterministico e separa le presenze consecutive per cinque squadre', () => {
    const first = generateGroupStageSchedule([group(5)])
    expect(generateGroupStageSchedule([group(5)])).toEqual(first)
    const matches = first.flatMap((turn) => turn.matches)
    for (let index = 1; index < matches.length; index += 1) {
      expect([matches[index - 1].teamAId, matches[index - 1].teamBId]).not.toContain(matches[index].teamAId)
      expect([matches[index - 1].teamAId, matches[index - 1].teamBId]).not.toContain(matches[index].teamBId)
    }
  })

  it('allinea sei gironi da cinque in dieci Turni globali', () => {
    const schedule = generateGroupStageSchedule(Array.from({ length: 6 }, (_, index) => group(5, index)))
    expect(schedule).toHaveLength(10)
    expect(schedule.flatMap((turn) => turn.matches)).toHaveLength(60)
    expect(schedule.every((turn) => turn.matches.length === 6)).toBe(true)
    expect(schedule.every((turn) => new Set(turn.matches.map((match) => match.groupId)).size === turn.matches.length)).toBe(true)
    expect(schedule.every((turn) => new Set(turn.matches.map((match) => match.courtId)).size === turn.matches.length)).toBe(true)
  })

  it('lascia assenti i gironi più corti dai Turni finali', () => {
    const schedule = generateGroupStageSchedule([5, 5, 5, 4, 4].map((size, index) => group(size, index)))
    expect(schedule).toHaveLength(10)
    expect(schedule.slice(6).every((turn) => turn.matches.length === 3)).toBe(true)
  })

  it('ordina stabilmente i gironi per sortOrder, nome e id', () => {
    const schedule = generateGroupStageSchedule([group(2, 2), group(2, 0), group(2, 1)])
    expect(schedule[0].matches.map((match) => match.groupId)).toEqual(['g-0', 'g-1', 'g-2'])
  })
})
