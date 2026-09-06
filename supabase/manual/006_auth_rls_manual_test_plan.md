# Auth and RLS Manual Test Plan

Do not commit real credentials. Create temporary test users only from `/admin/access` after `008_bootstrap_auth_test.sql` and `009_verify_admin_bootstrap.sql` both succeed.

## Bootstrap IDs

Save the single result set returned by `008_bootstrap_auth_test.sql`:

```txt
tournament_id
group_id
court_1_id
court_2_id
round_id
team_red_id
team_blue_id
match_id
```

Use these IDs only as expected references while checking scoped access.

## Account Creation Order

1. `ADMIN`
   - Login as the manually created `admin` user.
   - Open `/admin/access`.
   - Confirm the current tournament is the bootstrap tournament.

2. `TEAM RED`
   - Use preset `Team Red`.
   - Username: `team_red`.
   - Role: `team`.
   - Assignment: Team Red / `team_red_id`.
   - Leave password empty to auto-generate, unless a manual test password is needed.

3. `TEAM BLUE`
   - Use preset `Team Blue`.
   - Username: `team_blue`.
   - Role: `team`.
   - Assignment: Team Blue / `team_blue_id`.
   - Leave password empty to auto-generate, unless a manual test password is needed.

4. `REFEREE`
   - Use preset `Referee`.
   - Username: `referee_test`.
   - Role: `referee`.
   - Assignment: Court 1 / `court_1_id`.

5. `COURT DISPLAY`
   - Use preset `Court Display`.
   - Username: `court_display_test`.
   - Role: `court_display`.
   - Assignment: Court 1 / `court_1_id`.

6. `MAIN DISPLAY`
   - Use preset `Main Display`.
   - Username: `main_display_test`.
   - Role: `main_display`.
   - No team or court assignment.

Temporary passwords are visible only immediately after provisioning. Save them outside the repository.

## Admin Expected Results

- Login: `admin`.
- Can open `/admin`, `/admin/setup`, `/admin/control-room`, `/admin/access`, `/admin/recovery`.
- Can read tournament, teams, players, courts, rounds, matches, lineups, global events.
- Can create the five test users through `provision-tournament-user`.
- Can preview `/main-display` and `/court-display`.

## Team Red Expected Results

- Login: `team_red`.
- Route: `/player`.
- Readable matches: includes `match_id`.
- Visible teams/players: Team Red and allowed match context only.
- Own `match_cards`: accessible when cards exist for Team Red.
- Team Blue `available` `match_cards`: not accessible, should return zero rows or be denied by RLS.
- Mutation check: can request/play only its own valid card; denied for Team Blue card.

## Team Blue Expected Results

- Login: `team_blue`.
- Route: `/player`.
- Readable matches: includes `match_id`.
- Own `match_cards`: accessible when cards exist for Team Blue.
- Team Red `available` `match_cards`: not accessible, should return zero rows or be denied by RLS.
- Mutation check: can request/play only its own valid card; denied for Team Red card.

## Referee Expected Results

- Login: `referee_test`.
- Route: `/referee`.
- Scope: Court 1 / `court_1_id`.
- Readable matches: includes `match_id`.
- Update match: allowed for `match_id`.
- Update another court match, if present on `court_2_id`: denied.
- Private `available` opponent cards: not readable; non-private active/resolved card context may be visible.

## Court Display Expected Results

- Login: `court_display_test`.
- Route: `/court-display`.
- Scope: Court 1 / `court_1_id`.
- Readable matches: includes `match_id`.
- Match updates: denied.
- Private `available` cards: not readable.
- Public applied/active card state may be visible according to RLS.

## Main Display Expected Results

- Login: `main_display_test`.
- Route: `/main-display`.
- Readable: tournament/global live state and matches allowed for display.
- Private `match_cards`: none visible.
- Mutations: denied.

## Optional DEV RLS Debug Panel

In development only, `/admin/access` shows an RLS debug panel for the current authenticated profile:

- current role
- current team/court
- readable match count
- own visible `match_cards`
- opponent available `match_cards` visible
- update-match expectation

The panel does not show passwords or secrets and does not run automatic update mutations.

## Reset And Cleanup

Recommended order:

1. Create/download backup.
2. Run `cleanup-tournament-auth-users` for non-admin temporary users.
3. Run `reset_tournament`.

The permanent admin user is not deleted by database reset.
