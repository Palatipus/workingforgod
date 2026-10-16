# Working For God Ventures: Inventory and Sales

React + Vite + Tailwind frontend, Supabase backend.

## Setup
1. Create a Supabase project. Turn OFF Authentication > Providers > Email > "Confirm email".
2. In the SQL Editor run, in this order: schema.sql, schema_update.sql, schema_update_2.sql, schema_update_3.sql, schema_update_4.sql, schema_update_5.sql, schema_update_6.sql, schema_update_7.sql, schema_update_8.sql, schema_update_9.sql, schema_update_10.sql, schema_update_11.sql, schema_update_12.sql, schema_update_13.sql, schema_update_14.sql, schema_update_15.sql
   (on an existing database, run only the files you have not run yet)
3. Authentication > URL Configuration: set Site URL and Redirect URLs to your app address.
4. cp .env.example .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
5. npm install, then npm run dev (npm run dev -- --host to test on a phone)
6. Click "Request access" on the login page to sign up, then make yourself admin in the SQL Editor:
   update profiles set role = 'admin', status = 'approved' where id = 'YOUR-USER-ID';
   After that, manage everyone else (approve, remove, make admin) from the Team page.
7. To wipe test orders and customers before going live, run reset_test_data.sql.

## Deploy on Render
Push to GitHub, then on Render choose New > Blueprint (uses render.yaml) or New > Static Site with:
- Build command: npm install && npm run build
- Publish directory: dist
- Env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY, NODE_VERSION=22 (set before the first build)
- Rewrite rule: /* -> /index.html (so refreshing /orders works)

Then set the Render URL as Site URL and a Redirect URL in Supabase > Authentication > URL Configuration.

## Phone notifications
Everything that shows in the bell is also sent to people's phones, even when the app is closed.
Each person turns it on once per device (the app asks them). On iPhone (iOS 16.4+) the app must be
added to the Home Screen and opened from there first. Only works on the deployed (https) app, not npm run dev.

1. Make the keys (once): npx web-push generate-vapid-keys
2. Install the Supabase CLI, then: supabase login, supabase link --project-ref YOUR-PROJECT-REF
3. Set the function's secrets (PUSH_SECRET is any long random text you make up):
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com PUSH_SECRET=...
4. Deploy it: supabase functions deploy send-push --no-verify-jwt
5. Run schema_update_13.sql, then in the SQL Editor (your project URL and the same PUSH_SECRET):
   select vault.create_secret('https://YOUR-PROJECT.supabase.co/functions/v1/send-push', 'push_function_url');
   select vault.create_secret('YOUR-PUSH_SECRET', 'push_secret');
6. Add VITE_VAPID_PUBLIC_KEY (the public key) to .env and to Render's env vars, then redeploy.

If phones aren't getting them: Supabase > Edge Functions > send-push > Logs.

## Backups
The database and product photos are copied to GitHub every night. Setup and restoring: RESTORE.md.
Error codes shown in the app: error-codes.pdf (rebuild with npm run error-codes).
