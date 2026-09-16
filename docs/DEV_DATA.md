# Development tournament data

An authenticated Admin can open `/admin/setup` → TEST DATA, between SPECIAL EVENTS and SUMMARY. During the current testing phase this panel is intentionally available regardless of Vite DEV mode, including preview/production builds. It is marked TESTING TOOL, with TODO comments to restrict/remove it before production release. Existing Admin route authorization remains in place. There is no startup seeding.

## A–D. Dataset and validation

`src/dev/mockPlayers.ts` defines 99 immutable, realistically named players with stable `mock-player-001` through `mock-player-099` IDs. `mockTeams.ts` defines 33 immutable named teams, each containing exactly three distinct players. Every player belongs to one template team.

There are 11 male, 11 female and 11 mixed teams: 50 male and 49 female players. Mixed teams alternate 2M/1F and 1M/2F. `validateMockDataset()` rejects incorrect counts, duplicate IDs/names, incomplete rosters, missing/reused players, invalid genders and mismatched compositions.

## E. Seeder

`generateTestTeams` supports random sampling without replacement and deterministic sampling by seed (default: tournament ID). Filters: all, male, female, mixed, balanced. Balanced counts may differ by one. Single-composition filters support at most 11 teams. Requests over 33 are rejected explicitly.

The configured `teamsCount` is the final total, including existing manual teams. The demo replacement fills the remaining slots and removes only previous test rosters and their dependent state. A conflicting manual team name causes an explicit error rather than overwriting it. Templates are cloned into normal `Team` / `Player` entities, with tournament-prefixed IDs and optional `isTestData` metadata. Domain genders remain `man` / `woman`; existing roster validation and rules are reused.

## F. Admin tools and demo persistence

Generation, replacement and removal require confirmation. Structural changes are locked after start. Generated teams can be inspected for players/genders, auth status, group, current/next match, cards and lineups. No persisted Gold/Silver assignment exists in the current domain, so the inspector identifies that limitation.

Demo generation installs the selected tournament in the normal demo store. Its existing persistence and cross-tab transport save tournament snapshots, configuration, events and selections. The Admin selector restores the selected saved tournament. Each tournament retains its own team/group/qualifier/court/BYE configuration. Manual prize drafts are preserved. Group draws and match scheduling remain separate existing operations; seeding creates rosters only.

## G–H. Supabase and credentials

GENERATE TEST TEAMS always opens the existing generation dialog. In demo mode it installs the roster immediately after confirmation. In Supabase mode it generates a tournament-scoped local preview first; no database writes occur during generation. The secondary SEED TEST DATA TO SUPABASE action appears after generation and requires its own confirmation. It uses `create_team_with_roster` through the existing team repository. The server generates database UUIDs; template IDs are not sent as player UUIDs. Local workspace-only tournaments cannot be seeded to Supabase.

Each created team is provisioned through the existing `provision-tournament-user` Edge Function, with the selected tournament ID and normal username normalization/collision suffixes. The shared DEV password is isolated in `src/dev/supabaseTestSeeder.ts`; normal provisioning code is unchanged. Technical emails are not displayed.

Results distinguish team creation from successful account provisioning. Only confirmed successful accounts appear in the credentials CSV, with `team_name,composition,username,password`. Demo mode creates no Supabase accounts and reports zero login accounts. There is no auth bypass.

Progress is tracked in memory per tournament for the browser session. Retrying skips successful accounts and reuses confirmed team IDs. If an account already exists with an unknown password, it is not exported as a working test credential. If a team creation request fails without a confirmed ID, automatic recreation is blocked because the server might already have committed it. Verify such cases manually. Do not refresh during a batch: there is no persisted batch manifest or transaction across roster creation and account provisioning.

## I. Cleanup

Demo REMOVE TEST TEAMS and RESET TOURNAMENT TEST DATA remove generated teams/players, their matches and dependent cards, events, standings and reports. Unrelated manual teams and state remain. References to deleted prize winners are cleared without removing the manual event.

Supabase cleanup is intentionally manual: the schema has no durable test marker and the existing auth cleanup deletes all non-admin tournament accounts. The development panel never calls it. No migration, broad deletion, production schema change or real database seeding was performed while implementing this step.

## J. Files

- New dataset, seeder, demo adapter, Supabase runner, panel and tests: `src/dev/`.
- Domain metadata: `src/shared/types/domain.ts`.
- Existing persistence and cross-tab state: `src/demo/demoTypes.ts`, `src/demo/demoStore.ts`.
- Selected tournament integration: `src/features/admin/workspace/{workspaceStore,useAdminWorkspace,TournamentSelector}`.
- DEV lazy-loading entry point: `src/features/admin/setup/TournamentSetupPage.tsx`.
- This document: `docs/DEV_DATA.md`.

## K. Verification

Run `npm run test`, `npm run lint`, and `npm run build`. Tests cover dataset integrity, 12/30/33-team generation, invalid counts, reproducibility, filters, normal roster/lineup compatibility, manual preservation, demo persistence/switching, UI authorization/confirmations and mocked Supabase provisioning/retries. Visibility tests also exercise `DEV=false`, the empty-tournament card, non-admin roles and the separate Supabase action. The testing modules are temporarily included in builds under the current visibility requirement. Real Supabase provisioning requires an explicit Admin action in a development session and has not been executed by these tests.
