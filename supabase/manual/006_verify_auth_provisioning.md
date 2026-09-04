# Auth Provisioning Verify

Edge Functions are deployed outside SQL migrations.

After deployment, verify in Supabase Dashboard:

- `provision-tournament-user` exists.
- `cleanup-tournament-auth-users` exists.
- Both functions have access to server-side `SUPABASE_URL`.
- Both functions have access to server-side `SUPABASE_SERVICE_ROLE_KEY`.
- No service role key exists in Vite `.env.local`.
- The first permanent admin Auth user exists.
- The first admin has a `profiles` row with role `admin`.

Do not expose technical emails to end users. Give users only username and password.
