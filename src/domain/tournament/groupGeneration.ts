import type { Team } from '../../shared/types/domain'
export type GeneratedGroup = { name: string; sortOrder: number; teamIds: string[] }
export type GroupMode = 'seeded' | 'random'
export function generateGroups(teams: readonly Pick<Team, 'id' | 'ranking'>[], sizes: number[], mode: GroupMode, random = Math.random): GeneratedGroup[] {
  if (!sizes.length || sizes.some(n => !Number.isSafeInteger(n) || n < 1) || sizes.reduce((a,b) => a+b,0) !== teams.length || new Set(teams.map(t => t.id)).size !== teams.length) throw new Error('Distribuzione dei gironi non valida.')
  const ordered = [...teams]
  if (mode === 'seeded') {
    if (ordered.some(t => t.ranking == null || !Number.isSafeInteger(t.ranking) || t.ranking < 1) || new Set(ordered.map(t => t.ranking)).size !== ordered.length) throw new Error('Per generare i gironi con teste di serie, tutte le squadre devono avere un ranking univoco.')
    ordered.sort((a,b) => a.ranking! - b.ranking!)
  } else {
    for (let i = ordered.length-1; i > 0; i--) { const r = random(); if (r < 0 || r >= 1 || !Number.isFinite(r)) throw new Error('Valore casuale non valido.'); const j = Math.floor(r*(i+1)); [ordered[i],ordered[j]] = [ordered[j],ordered[i]] }
  }
  const groups = sizes.map((_,i) => ({ name: `Girone ${groupLetters(i)}`, sortOrder: i+1, teamIds: [] as string[] }))
  let next = 0, reverse = false
  while (next < ordered.length) {
    for (let k = 0; k < groups.length; k++) { const i = reverse ? groups.length-1-k : k; if (groups[i].teamIds.length < sizes[i]) groups[i].teamIds.push(ordered[next++].id) }
    reverse = !reverse
  }
  return groups
}
function groupLetters(index: number): string { let label = ''; for (let n=index+1; n>0; n=Math.floor((n-1)/26)) label=String.fromCharCode(65+(n-1)%26)+label; return label }
