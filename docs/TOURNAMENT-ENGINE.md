# Tournament engine: groups, Gold/Silver and byes

## Files and contracts

- `src/domain/tournament/tournamentTypes.ts`: setup input, structured validation, group/bracket plans, seeded teams, slots and the future standings contract.
- `groupEngine.ts`: balanced group distribution and round-robin counts.
- `bracketEngine.ts`: next power of two, bracket plans, deterministic seed placement, bracket generation and immutable result propagation.
- `tournamentSetupEngine.ts`: validation, aggregate plan, qualification split and independent Gold/Silver bracket generation.
- `tournamentEngine.test.ts`: examples, edge cases, balance invariants, bye allocation/advancement, immutability and complete knockout progression.
- `src/features/admin/setup/TournamentStructurePreview.tsx`: shared presentation for General and Summary.

All engine functions are pure TypeScript. They do not import React, repositories, storage or auth. Validation returns errors/warnings with `code`, `field` and `message`. `calculateTournamentSetup` returns `plan: null` for invalid input.

## Tournament ownership

Each `WorkspaceEntry`, indexed by tournament ID, owns its own configuration:

```ts
{
  teamsCount,
  teamsPerGroup,
  goldQualifiedCount,
  silverQualifiedCount,
  courtsCount,
  allowByes,
}
```

There is no shared active-configuration object. Existing short field names were replaced by this domain contract. New tournaments default to `teamsPerGroup: 5` and `allowByes: true`. The store's save/start checks delegate structural validation to the engine.

General previews its current form draft immediately. Saving updates only that tournament's entry; switching the selector remounts the form by tournament ID and loads that tournament's saved configuration. Unsaved edits are not committed when switching. Summary uses the selected entry's saved configuration. State remains in memory, as in the previous UI step.

## Calculation semantics

The group count starts at `ceil(teamsCount / teamsPerGroup)`, capped at `floor(teamsCount / 2)` to avoid singleton groups. Remaining teams are distributed one per group, largest groups first; sizes differ by at most one. The preferred size is advisory, so 3 teams with preferred size 2 form one group of 3.

`groupMatchCounts` and `matchesPerTeam` contain one number per group. A group's matches are `n * (n - 1) / 2`; each member plays `n - 1`.

Zero qualifiers disables a bracket. Exactly one qualifier is invalid. `totalBracketSlots` is the number of entrant positions, including bye positions; the generated array instead contains all round nodes. Non-bye nodes equal `qualifiedTeams - 1` playable matches. Both qualifier counts may be zero.

Standard mirrored seeding distributes the strongest seeds across bracket halves. Missing seeds above N are null, never fake teams. For 12 entrants in a 16-position bracket, seeds 1–4 receive byes in first-round nodes 1, 3, 5 and 7. Those winners immediately populate their next-round home/away slots. A later round waiting for a feeder is not considered a bye.

`applyBracketResult` validates the match, participants and advancement link, and returns new state. Reapplying the same winner is idempotent. Changing an already decided winner is rejected: correction/reset policy is outside this step. Gold/Silver IDs are namespaced separately.

`selectQualifiedTeams` consumes an already globally ordered ranking without sorting points or positions. Gold takes the first N entries; Silver takes the next M and restarts seeding at 1. Tie-break policy remains external.

Recommended courts equal the calculated group count. Fewer courts produces a warning, not an error. Numeric inputs must be safe integers; materialized structures and court lists have a defensive capacity limit of 65,536.

## Explicit examples

| Configuration | Groups | Group matches | Gold | Silver | Eliminated | Total |
| --- | --- | --- | --- | --- | --- | --- |
| 30 teams, preferred 5, 12 Gold, 12 Silver | 6 × 5 | 60 | 16 slots / 4 byes / 11 matches | 16 slots / 4 byes / 11 matches | 6 | 82 |
| 12 teams, preferred 4, 4 Gold, 4 Silver | 3 × 4 | 18 | 4 slots / 0 byes / 3 matches | 4 slots / 0 byes / 3 matches | 4 | 24 |
| 24 teams, preferred 5 | 5 / 5 / 5 / 5 / 4 | 10 + 10 + 10 + 10 + 6 = 46 | Depends on qualifiers | Depends on qualifiers | Depends on qualifiers | Depends on qualifiers |

The DOM regression test switches A → B → A, edits and saves A, then switches again in both General and Summary. It verifies independent values, immediate recalculation, different bye policies and preservation of B's configuration.

No backend, auth, scoring UI, result-submission flow, standings rules, scheduling or realtime changes are included.
