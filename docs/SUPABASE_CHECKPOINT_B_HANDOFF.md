# Supabase application wiring: checkpoint B handoff (2026-09-14)

This supersedes the database assumptions and implementation plan in `SUPABASE_PERSISTENCE_HANDOFF.md`. The user now confirms the remote schema migrations have ALREADY been applied and verified. Do not create, modify or rerun migrations. The current request explicitly excludes group generation.

## Completed checkpoints

A: relevant architecture and both Edge authorization callers audited.

B: server authorization updated locally. `requireTournamentAdmin(profile, tournamentId, adminClient)` is asynchronous. It requires an authenticated caller profile with role `admin` AND a `tournament_admins` row for `user_id=profile.id`, `tournament_id=target`. Original/default tournaments also require membership. Query errors fail closed. Non-admin roles are rejected before lookup. `profiles.tournament_id`, caller authentication and secret handling are unchanged.

Both callers await authorization before any provisioning/cleanup work:
- `supabase/functions/provision-tournament-user/index.ts`
- `supabase/functions/cleanup-tournament-auth-users/index.ts`

The implementation lives in `supabase/functions/_shared/auth.ts`, delegating the role/membership assertion to new `supabase/functions/_shared/tournamentAdmin.ts`. Separating the lookup callback avoids recursive generic type instantiation from exposing a Supabase query-builder structural interface.

## Not started

C tournament repository, D selection/cache, E General setup, F full card CRUD/activation, G rankings, H safe delete, remaining I tests, J real-flow verification. Stop was at the completed B boundary; no C wiring is partially applied.

## Database state

User-reported applied support: `tournament_admins`, `tournament_card_activation` with RLS; configuration fields on tournaments (`teams_count`, `teams_per_group`, `gold_qualified_count`, `silver_qualified_count`, `courts_count`, `allow_byes`, `theme_preset`, `theme_color`); nullable `teams.ranking` with per-tournament non-null uniqueness; card `image_url`, `archived_at`, `updated_at`. Original Admin memberships backfilled.

RPCs reported available: `create_tournament_for_admin`, `update_tournament_configuration`, `delete_tournament_if_safe`, `set_tournament_card_enabled`, `archive_card_definition`, `set_team_ranking`, `assign_random_team_rankings`, `is_platform_admin`, updated authorization helpers and `draw_match_cards`.

No migrations were created/modified/executed by this task; no remote DB changes, queries, seeding or deletion were performed. Exact RPC signatures must be read before integration, not guessed from conceptual names. User's applied SQL copies are in their Temp directory, including `202609120003_tournament_cards.sql`, `202609120004_team_ranking.sql`, `VERIFY_AFTER_MIGRATIONS.sql` and extracted `padelkaos_supabase_migrations_20260912.zip` folders. The card file was read only, not changed/copied. Its activation table uses `(tournament_id, card_definition_id)` as primary key.

## Architecture / frontend state

- Client: `src/services/supabase/client.ts` (`requireSupabase`); never expose env secrets.
- Contracts/provider hooks: `src/repositories/contracts/index.ts`, `src/repositories/{index,tournamentRepository,teamRepository,matchRepository,eventRepository}.ts`.
- Demo implementations: `src/repositories/demo/demoRepositories.ts`, backed by `src/demo/demoStore.ts`.
- Supabase implementation: `src/repositories/supabase/supabaseRepositories.ts`; tournament mapper: `src/repositories/supabase/mappers/tournamentMapper.ts`; application hook: `src/features/tournament/useTournament.ts`.
- Old Supabase loader still calls `get_active_tournament_state()`, takes the first tournament and uses `['supabase','active-tournament']`. `useSupabaseMatchRepository` reads this exact cache key too. Mutation invalidation uses `['supabase']`. Replace the generic scoped-data key coherently; don't leave match/event consumers on stale cache.
- Workspace: `src/features/admin/workspace/{workspaceStore,useAdminWorkspace,TournamentSelector}`. Creation, configuration and lifecycle remain local. In Supabase mode they are not yet backed by new RPCs. Persist only selected-ID preference locally, not authoritative server entities.
- Admin setup: `src/features/admin/setup/{TournamentSetupPage,GeneralSetup,LibraryPanel,TournamentLifecycle,TournamentSetup}`. `GeneralSetup` uses synchronous local `saveConfig`; `LibraryPanel` creates local visual cards and data-URL images; it does not yet provide persisted gameplay-aware CRUD. Teams/rosters are in `TournamentSetup.tsx`; reuse their normal domain validation and repository flow for ranking additions.
- Routes: `/admin/setup`, `/admin/teams` under existing Admin route guard. Preserve current design and demo behavior.
- DEV data: `src/dev/{TestDataPanel,tournamentSeeder,supabaseTestSeeder,demoTestData,mockPlayers,mockTeams,devDataTypes}`. 99 players/33 teams are complete. Admin TEST DATA is intentionally visible regardless of Vite DEV, before SUMMARY. GENERATE in Supabase stages local templates; explicit subsequent SEED persists through the normal roster RPC/provisioning. No automatic seeding or cleanup.

No frontend runtime code changed in checkpoint B.

## Edge deployment / tests

Edge source changes have NOT been deployed. Deno is not installed. A local TypeScript check covered both actual handler source files and imports using installed `@supabase/supabase-js` types and in-memory Deno globals: zero diagnostics. This is not a Deno runtime/deployment test.

`src/services/supabase/tournamentAdmin.test.ts`: 12 passing tests for original/second membership, absent memberships, all four non-admin roles, query errors/unexpected users, asynchronous completion and invalid targets. `npm run lint` and `npm run build` passed. Existing bundle-size warning remains. Full suite not rerun in B; preceding full suite was 268 passing tests. Earlier intermediate generic-type compile failures were fixed, not outstanding.

## NEXT PROMPT

Continue Padel Kaos in `C:\Users\alexp\Documents\Repo\padelKaos\padel-kaos` (React/TypeScript/Vite/MUI/TanStack Query/Supabase; PowerShell). Read `docs/SUPABASE_CHECKPOINT_B_HANDOFF.md`. The complete current request is in `C:\Users\alexp\.codex\attachments\0b52db4e-ebbc-4714-8459-55229ef3c482\pasted-text.txt`. It supersedes the old group-engine/persistence request.

Checkpoints A/B are complete locally; C-J are NOT STARTED. Do not redo B. B changed `_shared/auth.ts`, added `_shared/tournamentAdmin.ts`, updated both Edge handlers (`provision-tournament-user` and `cleanup-tournament-auth-users`) to await membership authorization, and added `src/services/supabase/tournamentAdmin.test.ts`. Admin role AND target `tournament_admins` membership are mandatory. Secret handling/profiles unchanged. Changes are NOT deployed; Deno unavailable. Twelve targeted tests, lint/build and local Edge-source TypeScript check passed; prior full suite 268 tests. Preserve preexisting dirty work and env secrets.

Remote migrations are ALREADY APPLIED and verified by the user. NO new/modified/rerun migrations and NO remote DB changes. Available schema: tournament_admins membership; tournaments configuration fields teams_count, teams_per_group, gold_qualified_count, silver_qualified_count, courts_count, allow_byes, theme_preset, theme_color; card_definitions image_url/archived_at/updated_at; tournament_card_activation; nullable teams.ranking with unique non-null ranking per tournament. RPCs: create_tournament_for_admin, update_tournament_configuration, delete_tournament_if_safe, archive_card_definition, set_tournament_card_enabled, set_team_ranking, assign_random_team_rankings. Read exact signatures/RLS from the user's applied SQL in `C:\Users\alexp\AppData\Local\Temp` (20260912000*.sql and extracted migration zip) before coding; do not infer signatures.

FIRST NEXT ACTION: inspect those RPC signatures and the current repository contracts, then implement checkpoint C fully with normal repository list/get/create/config-update/safe-delete operations. Use create/update/delete RPCs, never direct tournament insert/delete. Surface backend failures. Keep DB lifecycle configured (UI ready), never add ready to DB. Honor structural lock outside draft/configured.

Then D/E: wire explicit selected tournament ID and real Supabase list into Admin selector/General setup. After create select new ID; after safe deletion select accessible fallback or clear. Persist only selection preference locally. Every tournament-scoped query key includes ID. Existing `supabaseRepositories.ts` loader takes first result from get_active_tournament_state and match repository reads generic active-tournament key; fix all dependent cache usage. Switching/refetch must not leak A into B. Source configuration from Supabase, not workspace copies. Wire all six structure fields plus name/theme, editable only draft/configured, reuse existing engine validation and validate custom color. Demo keeps working.

F: full real card definition create/edit/archive and per-tournament activation. Use normal repository authenticated INSERT/UPDATE for card_definitions if applied RLS permits; if blocked STOP and report exact blocker, no migration/new create-card RPC. Include name/slug/description/image_url/effect_type/target_type/duration_type/duration_value/can_be_stolen/enabled using current domain. Image URL only, no Storage or durable-data-URL claims. Archive only via archive_card_definition, no hard delete/unarchive. Set tournament activation via set_tournament_card_enabled and activation table, never toggle global enabled to disable in one tournament. Global definitions and ID-scoped activations have coherent cache/refetch; respect archived_at and show backend errors. Do not implement dealing/gameplay UI; DB draw is authoritative.

G: Admin Teams shows persisted ranking with composition/players. Use set_team_ranking for set/change/clear and assign_random_team_rankings with bulk confirmation. Refetch, show useful duplicate errors, no silent renumbering. Editable only draft/configured, backend authoritative. Test teams use the same ranking fields/RPCs, no fake ranking layer.

H: safe deletion only eligible draft/configured through delete_tournament_if_safe; show status/profile rejection. Do NOT expand to completed/archived, invent cascades or bypass cleanup restrictions. Remove scoped cache after success, select fallback or empty state.

I/J: targeted tests each checkpoint, typecheck, lint/build; full suite when reasonable. Cover CRUD/refetch, A/B selection/config/card/ranking isolation, role restrictions, archived activation rejection, ranking duplicate/random/clear/live locks, safe/rejected deletion and no stale cache. Verify code supports create 30-team tournament (5/group,12 Gold,12 Silver,6 courts), create different second tournament, refresh/switch, card create/edit/archive/independent activation, ranking edits/randomization. Distinguish mocked tests from live verification. Finish each checkpoint before starting the next; if resources are insufficient stop at a clean boundary with a self-contained handoff.

Preserve dataset, normal demo behavior, existing Auth architecture and current Admin-only TEST DATA visibility regardless of Vite DEV. No direct Supabase queries in route components. No group generation/membership changes, scheduling, brackets/qualification changes, realtime, lineup backend, card dealing/play UI or Storage. Group generation is the future step only.

When stopping early report COMPLETED CHECKPOINTS, INCOMPLETE / NOT STARTED, DATABASE STATE, FRONTEND STATE, EDGE FUNCTION STATE, TEST STATE, NEXT PROMPT. On full completion report files, Edge auth/deployment state, tournament/card/ranking behavior, tests, no migration/DB changes and actual remaining risks.
