# Padel Kaos

Realtime-style demo app for a padel tournament inspired by sport entertainment formats.

## Demo Mode

This project currently defaults to a completely browser-only demo.

It does not connect to Supabase, does not require real authentication, and does not use WebSockets. The Supabase client and schema remain in the codebase for the future production path.

## Environment configuration

Real environment values belong in `.env.local`. Keep `.env.example` as placeholders only.

Demo:

```bash
VITE_DATA_PROVIDER=demo
```

Supabase:

```bash
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_AUTH_TOURNAMENT_SLUG=padel-kaos
```

Do not put service role keys, database passwords, or other secrets in frontend env files.

Set the data provider in `.env.local`:

```bash
VITE_DATA_PROVIDER=demo
```

Run:

```bash
npm run dev
```

Open these routes in multiple tabs of the same browser origin:

```txt
http://localhost:5173/admin
http://localhost:5173/player
http://localhost:5173/referee
http://localhost:5173/court-display
http://localhost:5173/main-display
```

The demo state is persisted with `localStorage` and synchronized across tabs with `BroadcastChannel`, with a `storage` event fallback.

## Supabase Provider

The app is prepared for:

```bash
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_AUTH_TOURNAMENT_SLUG=padel-kaos
```

Do not put service role keys, passwords, or secrets in frontend env files.

React components use repository hooks, not Supabase directly:

- `TournamentRepository`
- `MatchRepository`
- `EventRepository`

The factory keeps one application architecture and swaps only the provider implementation. Supabase Free and Supabase Pro use the same codebase, same schema, same RLS, same realtime channels, and same RPC names.

## Production Auth

End users log in with username and password. The browser derives a technical email internally from:

```txt
{username}.{VITE_AUTH_TOURNAMENT_SLUG}@auth.padelkaos.internal
```

Users do not need to know or enter this email. Use the same slug in the Edge Function secret `AUTH_TOURNAMENT_SLUG` so provisioning and login generate matching technical emails.

Bootstrap the first permanent Admin manually from Supabase Dashboard, then insert one `profiles` row for that Auth user with role `admin`. After that, Admin can provision temporary referee, team, court display, and main display accounts from the app.

Provisioning is handled by Edge Functions:

```txt
supabase/functions/provision-tournament-user
supabase/functions/cleanup-tournament-auth-users
```

Required Edge Function secrets:

```txt
SUPABASE_URL
SUPABASE_SECRET_KEYS
AUTH_TOURNAMENT_SLUG
```

On Supabase Cloud, `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are available automatically inside Edge Functions. The server admin client reads the `default` key from `SUPABASE_SECRET_KEYS`. `SUPABASE_SERVICE_ROLE_KEY` is supported only as a temporary legacy fallback.

`AUTH_TOURNAMENT_SLUG` remains a custom Edge Function secret/config value. Do not copy server secrets into frontend env files: the browser only needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the public auth slug.

Temporary team credentials can be bulk-generated and downloaded as CSV. The temporary password is returned to Admin only at creation time and is not stored in the application database.

## Cloud Auth Bootstrap

Use this flow to create the first Cloud Auth/RLS test scenario without creating Auth users from SQL:

1. Create the first Admin user manually in Supabase Authentication.
2. Copy the Admin user UID.
3. Replace `__ADMIN_AUTH_USER_ID__` in `supabase/manual/008_bootstrap_auth_test.sql`.
4. Run `supabase/manual/008_bootstrap_auth_test.sql` from Supabase SQL Editor.
5. Save the returned IDs for provisioning scoped test accounts.
6. Run `supabase/manual/009_verify_admin_bootstrap.sql` from Supabase SQL Editor.
7. Test frontend login with username `admin` and the password set for the manually created Auth user.

The browser builds the Admin technical email as:

```txt
admin.{VITE_AUTH_TOURNAMENT_SLUG}@auth.padelkaos.internal
```

The slug is normalized before the email is generated.

For event reset, use this order:

```txt
backup -> cleanup-tournament-auth-users -> reset_tournament
```

`reset_tournament` keeps the permanent Admin profile/user. Auth user cleanup is separate because deleting Supabase Auth users requires server-side Auth Admin privileges.

## Supabase Local

The initial production foundation migration lives in:

```txt
supabase/migrations/202609030001_production_foundation.sql
```

With Supabase CLI installed:

```bash
supabase start
supabase db reset
```

Docker/Supabase local is not required for the browser demo.

## Supabase Cloud - First Database Setup

Use the manual scripts because this Mac does not rely on the local Supabase CLI for the first Cloud apply.

1. Open the Supabase Dashboard.
2. Open SQL Editor.
3. Create a New query.
4. Paste and run `supabase/manual/001_apply_production_foundation.sql`.
5. If the apply succeeds, paste and run `supabase/manual/002_verify_production_foundation.sql`.
6. Optionally paste and run `supabase/manual/003_smoke_test_schema.sql`.
7. Do not use `supabase/schema.sql`; it is legacy reference only.

If the first apply fails, do not automatically rerun the whole script. Check the failing statement, inspect what was already created, and decide on a targeted fix before continuing.

## Tournament Lifecycle

Tournament status uses one lifecycle field:

```txt
draft -> configured -> live -> completed -> archived
```

Avoid parallel booleans for lifecycle state. Reset is allowed only after `completed` or `archived`, and only when a recent valid backup exists.

## Backup

JSON is the restorable backup format. PDF is only a readable archive for people.

The backup payload is versioned with `schemaVersion: 1` and includes a SHA-256 checksum to catch corrupted or accidentally modified files. The checksum is not a signature and does not authenticate the file.

Included in JSON backups:

- tournament metadata
- groups
- courts
- rounds
- teams
- players
- matches
- lineups
- card definition snapshot
- match cards
- global events
- tournament events

Excluded from JSON backups:

- passwords
- JWTs
- refresh tokens
- service role keys
- auth sessions
- database credentials

Server-side temporary snapshots live in `tournament_backups` with a suggested 48-hour retention window.

## Restore

Restore preserves original UUIDs from the backup. This keeps foreign keys, match references, team references, player references, and event winners coherent.

Restore must parse JSON, verify `schemaVersion`, verify checksum, validate shape, validate logical foreign keys, and reject UUID collisions before writing. React components should call recovery services/contracts rather than inserting restored rows directly.

## Safe Reset

Reset is destructive and is not reversible without a valid JSON/server backup.

The database RPC `reset_tournament(p_tournament_id uuid)` requires an authenticated admin profile, tournament status `completed` or `archived`, and a recent valid server backup. It deletes event-specific data but does not delete `auth.users`; future user disable/delete work belongs in a separate server-side Auth Admin operation.

The frontend reset flow must require re-authentication, the confirmation phrase `RESET PADEL KAOS`, a short countdown, and a final confirmation before calling the reset RPC.

Manual scripts for this step:

```txt
supabase/manual/004a_check_partial_backup_apply.sql
supabase/manual/004_apply_backup_reset.sql
supabase/manual/005_verify_backup_reset.sql
```

After a failed manual apply, run `004a_check_partial_backup_apply.sql` first. If it shows all backup/reset objects missing, run the corrected `004_apply_backup_reset.sql`. If it shows a partial state, review the reported objects before continuing; the corrected apply script is non-destructive and guards existing constraints, table, indexes, and policies, but it will not repair a manually altered table shape.

## Realtime Channels

Match level:

```txt
match:{matchId}
```

For match score, match status, lineups, card played, card activated, card expired, and match completed.

Round/global level:

```txt
round:{roundId}:global
```

For global dice, KAOS state, global event start, global winner, and global announcements.

Global events:

```txt
global-events:{tournamentId}
```

For tournament-wide special events such as Por Tres.

## Demo Flow

1. Admin -> Load Demo Scenario
2. Admin -> Draw Match Cards
3. Admin -> Start Match
4. Referee -> assign points
5. Player -> choose TEAM RED and play POWER POINT
6. Referee -> receives CARD PLAYED and acknowledges it
7. Referee -> next TEAM RED rally applies two score transitions and consumes POWER POINT
8. Player -> tries the second TEAM RED card in set 1 and gets blocked
9. Referee -> End Set
10. All screens -> KAOS TIME / Waiting for dice
11. Referee -> Roll Kaos Dice
12. Referee -> Start Set 2
13. Player -> TEAM RED can now use the remaining set 2 card
14. Admin -> Activate Por Tres
15. Referee -> Register Por Tres for an active player
16. Referee -> End Match
17. Main Display -> shows the winner/final state overlays

## Simulated Features

- Team creation with 3 players and gender.
- Match creation with active lineups.
- Relative gender handicap at the start of every game.
- Shared score updates controlled by the referee.
- Visual card flow: available -> pending -> active -> used.
- Automatic random draw of exactly 3 cards per match team.
- One card maximum per team per set.
- POWER POINT effect: next winning rally for that team applies two score transitions.
- Manual timed-match flow: the referee controls End Set and End Match.
- End Set 1 enters Kaos Pending and blocks scoring until dice + Start Set 2.
- Kaos dice roll stored once per match and persisted across refreshes.
- Por Tres global event with first-winner-wins behavior.
- Admin event log showing the last 100 demo events.

## Production Model

The migration introduces:

- `tournaments`
- `groups`
- `courts`
- `rounds`
- `teams`
- `profiles`
- `players`
- `matches`
- `match_lineups`
- `card_definitions`
- `match_cards`
- `card_usages`
- `dice_rules`
- `match_events`
- `tournament_events`
- `global_events`
- `global_event_winners`

Critical RPCs prepared:

- `draw_match_cards`
- `play_card`
- `activate_card`
- `steal_active_card`
- `roll_global_dice_for_round`
- `claim_global_event_winner`
- `start_match`
- `end_set`
- `start_second_set`
- `end_match`
- `record_game_won`
- `record_super_tiebreak_point`
- `activate_por_tres`
- `create_tournament_backup_snapshot`
- `reset_tournament`
- `restore_tournament_backup`

## Free To Pro Checklist

Development:

- Use Supabase Free.
- Configure local `.env`.
- Run migrations.
- Smoke test auth, RLS, RPC, and realtime.

Production event:

- Upgrade the same Supabase project to Pro.
- Verify billing and project pause settings.
- Verify realtime quotas.
- Verify backups.
- Run a full smoke test with admin, referee, team, court display, and main display users.
- Do not add `SUPABASE_PRO` branches in app code.

## Limitations

Cross-tab sync works for tabs/windows on the same browser origin. For physically separate devices, the production Supabase Realtime path will be needed.

Undo is shown as a demo control placeholder but is not implemented yet.

The Supabase provider is scaffolded around contracts/RPCs, but it still needs real project env, seed data, auth user creation, and an end-to-end Supabase smoke test before an event.

## Verification

```bash
npm run test
npm run lint
npm run build
```
