export type ScheduleGroupInput = {
  id: string
  name: string
  sortOrder?: number
  assignedCourtId: string
  teamIds: string[]
}

export type ScheduledGroupMatch = {
  groupId: string
  courtId: string
  teamAId: string
  teamBId: string
}

export type GlobalTurn = {
  sequence: number
  matches: ScheduledGroupMatch[]
}

type Pair = readonly [string, string]

export function generateGroupStageSchedule(groups: ScheduleGroupInput[]): GlobalTurn[] {
  const orderedGroups = [...groups].sort(compareGroups)
  const courtIds = orderedGroups.map((group) => group.assignedCourtId)
  if (!orderedGroups.length) throw new Error('È necessario almeno un girone.')
  if (orderedGroups.some((group) => !group.assignedCourtId)) throw new Error('Ogni girone deve avere un campo assegnato.')
  if (new Set(courtIds).size !== courtIds.length) throw new Error('Ogni girone deve avere un campo diverso.')
  if (orderedGroups.some((group) => group.teamIds.length === 0)) throw new Error('Ogni girone deve contenere almeno una squadra.')

  const schedules = orderedGroups.map((group) => ({
    group,
    pairs: orderPairsForRest([...group.teamIds].sort().flatMap((teamAId, index, teams) =>
      teams.slice(index + 1).map((teamBId): Pair => [teamAId, teamBId]),
    )),
  }))
  const turnsCount = Math.max(...schedules.map(({ pairs }) => pairs.length))

  return Array.from({ length: turnsCount }, (_, index) => ({
    sequence: index + 1,
    matches: schedules.flatMap(({ group, pairs }) => {
      const pair = pairs[index]
      return pair ? [{ groupId: group.id, courtId: group.assignedCourtId, teamAId: pair[0], teamBId: pair[1] }] : []
    }),
  }))
}

function compareGroups(a: ScheduleGroupInput, b: ScheduleGroupInput) {
  return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name, 'it')
    || a.id.localeCompare(b.id)
}

function orderPairsForRest(pairs: Pair[]): Pair[] {
  if (pairs.length < 2) return pairs
  // For event-sized groups, find a zero-consecutive-repeat ordering when one
  // exists. Stable candidate ordering keeps regeneration deterministic.
  if (pairs.length <= 21) {
    const result = findSeparatedPath(pairs)
    if (result) return result
  }
  const remaining = [...pairs]
  const result: Pair[] = []
  while (remaining.length) {
    const previous = result.at(-1)
    remaining.sort((a, b) => Number(sharesTeam(previous, a)) - Number(sharesTeam(previous, b)) || pairKey(a).localeCompare(pairKey(b)))
    result.push(remaining.shift()!)
  }
  return result
}

function findSeparatedPath(pairs: Pair[]): Pair[] | null {
  const ordered = [...pairs].sort((a, b) => pairKey(a).localeCompare(pairKey(b)))
  const visit = (path: Pair[], remaining: Pair[]): Pair[] | null => {
    if (!remaining.length) return path
    const previous = path.at(-1)
    const candidates = remaining.filter((pair) => !sharesTeam(previous, pair))
      .sort((a, b) => availableFollowers(a, remaining) - availableFollowers(b, remaining) || pairKey(a).localeCompare(pairKey(b)))
    for (const candidate of candidates) {
      const found = visit([...path, candidate], remaining.filter((pair) => pair !== candidate))
      if (found) return found
    }
    return null
  }
  for (const first of ordered) {
    const found = visit([first], ordered.filter((pair) => pair !== first))
    if (found) return found
  }
  return null
}

function availableFollowers(pair: Pair, pairs: Pair[]) {
  return pairs.filter((candidate) => candidate !== pair && !sharesTeam(pair, candidate)).length
}

function sharesTeam(a: Pair | undefined, b: Pair) {
  return Boolean(a && (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]))
}

function pairKey(pair: Pair) {
  return `${pair[0]}:${pair[1]}`
}
