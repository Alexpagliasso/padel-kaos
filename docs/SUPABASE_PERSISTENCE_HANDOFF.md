# Supabase persistence and seeded groups: audit and clean handoff

## Completed checkpoints

None of implementation checkpoints 1, 2, or 3 has started. The pre-implementation repository/schema audit is complete. Work stopped before checkpoint 1 because completing its database, authorization, repository and UI changes together was not safe within the remaining session capacity. No partial implementation was left behind.

Only this document was created in this turn. All other modified/untracked files predate this audit and must be preserved.

## Existing support

- `supabase/migrations/202609030001_production_foundation.sql`: `tournaments` already has UUID `id`, `name`, `phase`, text `status`, `created_at`, `updated_at`; `courts` and `groups` are tournament-scoped; `teams.group_id` already represents membership. Do not introduce duplicate tournament/group entities.
- `card_definitions` already supports global templates (`tournament_id IS NULL`) and tournament-specific definitions, `name`, `slug`, `description`, effect/target/duration fields, `can_be_stolen`, `enabled`, `created_at`. Preserve gameplay fields when editing visual metadata.
- `supabase/migrations/202609040001_tournament_backup_reset.sql` restricts lifecycle status to `draft`, `configured`, `live`, `completed`, `archived`. UI `ready` must map to `configured`; adding a second ready state is unnecessary.
- Existing reset requires completed/archived status and `has_recent_valid_tournament_backup`. Backup snapshots have a tournament FK with cascade deletion. Hard deleting a tournament therefore also deletes its server backup and profile rows; do not equate the existing reset RPC with safe hard deletion.
- `supabase/migrations/202609050001_team_roster_admin.sql` supplies `create_team_with_roster` / `update_team_with_roster`; roster updates are limited to draft/configured.
- `src/domain/tournament/` already calculates balanced group sizes, qualifiers and Gold/Silver brackets/BYEs. Its `QualifiedTeam.seed` is bracket seeding, not persisted pre-tournament team ranking. No ranking column was found in the checked SQL files.
- DEV-DATA is implemented in `src/dev/`: 99 players, 33 immutable teams, random/deterministic generation, filters, demo persistence, Supabase staging then explicit seeding, provisioning, inspector and cleanup. Preserve it.

## Missing support and integration risks

1. No persisted `teams_count`, `teams_per_group`, `gold_qualified_count`, `silver_qualified_count`, `courts_count`, `allow_byes`, theme preset/custom color were found in migrations. They currently live in `WorkspaceEntry.config`.
2. No per-tournament card activation relation or image URL column was found. `enabled` belongs to a definition; disabling a global definition is not a tournament activation toggle. No Supabase Storage bucket/upload implementation was found in the audited files. Use an image URL field for this checkpoint.
3. `is_admin_for(id)` and `can_read_tournament(id)` in the foundation migration compare `profiles.tournament_id` to the target ID. Each Auth user has one profile row. A newly created tournament cannot simply be inserted and administered with the existing policies. Additive ownership/admin membership may be needed; do not grant every Admin access to every tournament or move the original profile to the new tournament.
4. `supabase/functions/_shared/auth.ts:requireTournamentAdmin` separately checks the same single-tournament equality. SQL authorization changes alone would leave test-account provisioning broken on new tournaments. Keep SQL and Edge Function checks consistent without replacing the Auth architecture.
5. `src/repositories/contracts/index.ts` exposes only data/loading/error for the tournament repository. `src/repositories/supabase/supabaseRepositories.ts` calls `get_active_tournament_state()`, chooses the first returned tournament and caches under `['supabase', 'active-tournament']`. Selection must become explicit and query keys must include the selected ID. Audit existing cache consumers in match/event repositories when changing this key.
6. `src/repositories/supabase/mappers/tournamentMapper.ts` maps tournament identity/status and card gameplay fields, but no persisted setup configuration/image/activation overrides.
7. `src/features/admin/workspace/{workspaceStore,useAdminWorkspace,TournamentSelector}` implement session-local tournament CRUD/config/lifecycle. Demo seeded snapshots are persisted in the existing demo store. Supabase must stop using these local entries as its source of truth.
8. `src/features/admin/setup/{GeneralSetup,LibraryPanel,TournamentLifecycle,TournamentSetupPage}` call local workspace actions. General save is synchronous. Library supports local creation/toggling, not persisted edit/archive. Card image upload currently only produces an in-memory data URL.
9. `draw_match_cards` currently samples definitions where `enabled` is true and definition tournament matches OR is null. Persisted activation must be honored here, not only in the Admin UI. Existing match card references must survive global card archive/edit.
10. Backup/restore serializes selected fields and tables. New configuration/activation data needs a compatible backup/restore treatment before claiming the checkpoint preserves recovery guarantees.

## Database state

No migrations or RPCs were created or applied in this turn. No remote SQL, provisioning, seeding, deletion or schema changes were executed. The deployed database/migration history was not inspected; checked-in SQL is not evidence that it has been applied remotely.

Existing migration files are exactly the three listed above. `supabase/schema.sql` and `supabase/manual/` also exist; avoid treating manual/bootstrap scripts as new migrations to rerun blindly.

## Frontend state

Last completed work was DEV-DATA visibility. `/admin/setup` mounts `TournamentSetupPage` under the existing Admin `ProtectedRoute`. Tabs are GENERAL, TEAMS, CARDS, SPECIAL EVENTS, TEST DATA, SUMMARY. TEST DATA is temporarily Admin-only regardless of Vite DEV, including build/preview; do not reintroduce a DEV-only visibility guard. The generation button prepares a local preview in Supabase mode; only a second explicit confirmation persists the staged batch. Demo generation installs normal domain teams into the existing persisted demo store.

No frontend or runtime code changed during this audit.

## Test state

The immediately preceding completed change passed `npm run test` (268 tests, 31 files), `npm run lint`, and `npm run build`. The build reported the existing bundle-size warning. These checks were not rerun for this documentation-only audit. No checkpoint-1 integration or migration tests exist yet, and no live Supabase verification has been performed.

## NEXT PROMPT

Continue Padel Kaos in `C:\Users\alexp\Documents\Repo\padelKaos\padel-kaos` (React/TypeScript/Vite/MUI/Supabase; PowerShell). Read `docs/SUPABASE_PERSISTENCE_HANDOFF.md` first. The original detailed request is `C:\Users\alexp\.codex\attachments\0c158332-36a3-4621-8129-16a2b6fc53a3\pasted-text.txt`.

Current boundary: audit complete, implementation checkpoints 1/2/3 NOT STARTED. Only the handoff document was added by the audit. No new migration/RPC/schema changes were created or applied. Deployed migration state is unknown. Preserve all preexisting dirty files, including `.env.example`; do not expose `.env.local` secrets. Baseline from the preceding completed change: 268 tests, lint/build pass, existing large-bundle warning.

First action: inspect the single-tournament authorization in `is_admin_for` / `can_read_tournament` (foundation migration) and `supabase/functions/_shared/auth.ts:requireTournamentAdmin`. Design a minimal additive way for the existing Admin to create/manage additional tournaments while preserving access isolation and the original profile. Confirm migration execution/test facilities and deployed history if available. Report EXISTING SUPPORT and MISSING SUPPORT before adding any migration. Use the audit rather than repeating broad searches.

Work only in complete atomic checkpoints. Finish, test and report each before the next. If resources cannot safely cover the next checkpoint, stop before starting it and issue another complete handoff. Do not leave partial migrations, wiring, UI or broken types. Do not deploy migrations blindly or claim unexecuted SQL tests passed.

Checkpoint 1: implement real tournament/card persistence end to end. Reuse existing tables and lifecycle `configured` for UI `ready`. Add only missing tournament setup fields (team count, teams/group, Gold/Silver counts, court count, allowByes, supported theme), image URL and tournament-card activation relation if needed. Add normal repository list/get/create/update/delete methods and card create/read/update/archive-or-delete. No direct DB calls in route components. Switch Admin selector, General Save, Cards editor/toggles and lifecycle to persisted data in Supabase mode; explicit selected ID and ID-scoped query cache; refresh retains DB configuration. Keep demo behavior. Lock structural edits in live/completed. Draft/configured deletion needs confirmation; live deletion forbidden; completed deletion must preserve stricter backup/reset rules. Audit cascades: deleting tournaments deletes profiles and server backups, and must not silently orphan Auth users or remove Admin access. Honor per-tournament card activation in real card drawing, preserve referenced definitions, and account for new data in backup/restore. Use image URLs; defer a new upload system. Ensure test-team creation AND Edge account provisioning use the selected real tournament. Focused CRUD/isolation/lock tests, lint and build must pass before checkpoint 2.

Checkpoint 2: add/reuse a single nullable integer `ranking >= 1` per team; non-null rankings unique within the tournament. Ranking is not bracket seed or standings position. Persist edits/clear in Admin Teams only before LIVE. Keep team/player fields and composition visible. Extend existing test-generation options with no ranking or unique random 1..N rankings; same seed/teams must reproduce rankings. Test uniqueness, tournament isolation, edit/lock, random and deterministic assignments; keep build green.

Checkpoint 3: extend the pure group engine using existing balanced group sizing, then persist existing groups and `teams.group_id` memberships. Support SEEDED snake distribution and RANDOM modes, including reproducible unranked placement. Examples: 30/5 gives six groups of five with top six seeds separated; 12/4 gives three groups of four with top three separated; 23/5 gives 5,5,5,4,4. Each team exactly once. Add preview/generate/regenerate with replacement confirmation, and accessible MOVE TO group controls before LIVE. Moves must preserve membership, prevent cross-tournament groups and warn about nonrecommended sizes. No unnecessary parallel group model or full match scheduling. Start validation requires expected roster count, exactly one group per team, valid structure, Gold+Silver <= count and unique rankings when used. After LIVE lock structure, rankings, moves and regeneration. Team routes identify their group. Test random/snake/uneven generation, manual moves, duplicate prevention, regeneration, locks and isolation; run full tests/lint/build.

Preserve DEV-DATA dataset and latest visibility behavior: TEST DATA in `/admin/setup` before SUMMARY, authenticated Admin-only regardless of Vite DEV for this testing phase. GENERATE remains visible, works without Supabase in demo, and in Supabase stages normal-domain tournament-specific templates before a separate SEED TEST DATA TO SUPABASE confirmation. Never bypass Auth, auto-seed, broadly delete manual/test users, or create a second dataset/seeder/auth system.

Report completion honestly: A tournament persistence, B CRUD, C card persistence, D activation, E ranking, F seeded mocks, G group engine, H snake algorithm, I manual editing, J start locks, K migrations/RPCs created versus actually applied, L files, M tests/lint/build. If stopping early, give COMPLETED CHECKPOINTS, INCOMPLETE / NOT STARTED, DATABASE STATE, FRONTEND STATE, TEST STATE and a self-contained NEXT PROMPT.
