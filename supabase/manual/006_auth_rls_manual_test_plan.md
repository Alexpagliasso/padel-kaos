# Auth and RLS Manual Test Plan

Do not commit real credentials. Create temporary test users only after `008_bootstrap_auth_test.sql` and `009_verify_admin_bootstrap.sql` both succeed.

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

Use those IDs when provisioning scoped Auth test accounts.

## Test Accounts To Provision Later

- `admin`
- `referee_test`
- `team_red_test`
- `team_blue_test`
- `court_display_test`
- `main_display_test`

Suggested scopes:

- `admin`: existing manually created Admin Auth user with a bootstrap `profiles` row.
- `referee_test`: role `referee`, `courtId = court_1_id`.
- `team_red_test`: role `team`, `teamId = team_red_id`.
- `team_blue_test`: role `team`, `teamId = team_blue_id`.
- `court_display_test`: role `court_display`, `courtId = court_1_id`.
- `main_display_test`: role `main_display`.

Use separate browser sessions or separate Supabase clients authenticated as each account.

## Team Red vs Team Blue

- Team Red can read Team Red rows and the shared match on `match_id`.
- Team Red can select its own `match_cards`.
- Team Red gets zero rows or denied access for Team Blue `available` `match_cards`.
- Team Red can call `play_card` for its own valid card.
- Team Red is denied when calling `play_card` for Team Blue card.
- Repeat symmetrically for Team Blue.

## Referee

- `referee_test` assigned to `court_1_id` can read and update allowed match state for `match_id`.
- `referee_test` is denied updating matches assigned to `court_2_id`.
- `referee_test` can register a valid Por Tres winner for an active player in an assigned match.

## Court Display

- `court_display_test` assigned to `court_1_id` can read assigned-court match data for `match_id`.
- `court_display_test` is denied match updates.
- `court_display_test` cannot read private opponent cards with `available` status.

## Main Display

- `main_display_test` can read global/tournament live state for `tournament_id`.
- `main_display_test` cannot read private `match_cards`.
- `main_display_test` is denied all mutations.

## Admin

- `admin` can manage `tournament_id`.
- `admin` cannot access another tournament unless it has a profile scoped to that tournament.

## Reset And Cleanup

Recommended order:

1. Create/download backup.
2. Run `cleanup-tournament-auth-users` for non-admin temporary users.
3. Run `reset_tournament`.

The permanent admin user is not deleted by database reset.
