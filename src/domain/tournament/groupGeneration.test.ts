import { describe, it, expect } from 'vitest'
import { calculateGroupDistribution } from './groupEngine'
import { generateGroups } from './groupGeneration'
const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i+1}`, ranking: i+1 }))
describe('generazione gironi', () => {
  it.each([[30,5,[5,5,5,5,5,5]], [25,5,[5,5,5,5,5]], [20,5,[5,5,5,5]], [23,5,[5,5,5,4,4]], [24,5,[5,5,5,5,4]], [12,4,[4,4,4]]] as const)('distribuisce %i/%i', (n,p,sizes) => expect(calculateGroupDistribution(n,p).groupSizes).toEqual(sizes))
  it('alterna i passaggi dello snake', () => {
    expect(generateGroups(teams(12),[3,3,3,3],'seeded').map(g => g.teamIds)).toEqual([['t1','t8','t9'],['t2','t7','t10'],['t3','t6','t11'],['t4','t5','t12']])
  })
  it('rispetta capacità diverse senza duplicati e senza mutare le squadre', () => {
    const input = teams(23).reverse(); const snapshot = structuredClone(input)
    const result = generateGroups(input,[5,5,5,4,4],'seeded')
    expect(result.map(g => g.teamIds.length)).toEqual([5,5,5,4,4])
    expect(new Set(result.flatMap(g => g.teamIds)).size).toBe(23)
    expect(generateGroups(input,[5,5,5,4,4],'seeded')).toEqual(result)
    expect(input).toEqual(snapshot)
  })
  it('rifiuta ranking mancanti, duplicati e non validi', () => {
    for (const ranking of [null,1,0,1.5]) expect(() => generateGroups([{ id:'a',ranking:1 },{ id:'b',ranking }],[2],'seeded')).toThrow('ranking univoco')
  })
  it('casuale riproducibile con RNG iniettato, ignora i ranking', () => {
    const input = teams(23).map(t => ({ ...t, ranking:null }))
    const result = generateGroups(input,[5,5,5,4,4],'random',() => 0.25)
    expect(result).toEqual(generateGroups(input,[5,5,5,4,4],'random',() => 0.25))
    expect(result.map(g => g.teamIds.length)).toEqual([5,5,5,4,4])
    expect(new Set(result.flatMap(g => g.teamIds)).size).toBe(23)
  })
  it('rifiuta distribuzioni invalide', () => {
    expect(() => calculateGroupDistribution(1,5)).toThrow()
    expect(() => generateGroups(teams(3),[2],'random')).toThrow()
    expect(() => generateGroups(teams(3),[NaN],'random')).toThrow()
  })
})
