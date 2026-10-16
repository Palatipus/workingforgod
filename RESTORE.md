# Backups and restoring

Every night at 01:00 GMT, GitHub copies the whole database and the product photos to the
`backups` branch of this repository ([.github/workflows/backup.yml](.github/workflows/backup.yml)).

- `daily/2026-10-16.tar.gz`: the last 30 nights
- `monthly/2026-10.tar.gz`: the first copy of every month, kept for good
- `photos/`: every product photo

Each copy holds **all data since the app started**, not only that day's. Pick the newest copy from
before the problem happened.

## One-time setup

1. Supabase → your project → **Connect** (top bar) → **Session pooler** → copy the URI. It looks like
   `postgresql://postgres.abcd1234:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`.
   Put your database password in place of `[YOUR-PASSWORD]`. If you don't know it, reset it in
   Supabase → Project Settings → Database. If the password has symbols like `@ # / ?`, choose one
   without them, or they break the link.
   Use the **Session pooler**, not "Direct connection": GitHub can't reach the direct one on the Free plan.
2. GitHub → this repository → **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `SUPABASE_DB_URL`. Value: the URI from step 1.
3. **Actions** tab → **Nightly backup** → **Run workflow**. After 1-2 minutes it should be green, and the
   `backups` branch appears with today's copy. The log shows how many orders, customers, products and
   receipts were saved.

If a night fails, GitHub emails you. The usual causes are a changed database password (update the
secret) or a paused Supabase project (open the dashboard to wake it).

## Restoring

You need `psql` version 17 (on this laptop: `/usr/lib/postgresql/17/bin/psql`).

1. Download the copy: GitHub → this repository → switch to the `backups` branch → `daily/` →
   choose the file → **Download raw file**. Then unpack it: `tar -xzf 2026-10-16.tar.gz`.
   That gives `schema.sql`, `auth.sql`, `data.sql` and `counts.txt`.
2. Create a **new** Supabase project. Never restore over the live one: if the copy is wrong you'd
   lose both. Copy its Session pooler URI as in the setup above. Below it is called `NEW`.
3. Restore, in this order:

   ```sh
   NEW='postgresql://postgres.xxxx:PASSWORD@aws-0-....pooler.supabase.com:5432/postgres'
   psql "$NEW" -v ON_ERROR_STOP=1 -f schema.sql
   psql "$NEW" -v ON_ERROR_STOP=1 --single-transaction -c "set session_replication_role = replica" -f auth.sql -f data.sql
   psql "$NEW" -v ON_ERROR_STOP=1 -f restore-extras.sql
   ```

   `restore-extras.sql` is in the main branch of this repository. It recreates the photo bucket, the
   sign-up trigger and live updates.
4. Check it: `psql "$NEW" -c "select count(*) from orders"` should match `orders` in `counts.txt`.
5. Photos: Supabase → Storage → `product-images` → upload the contents of the `photos/` folder, keeping
   the folder names. Then point the products at the new project (use the old and new project ids
   from the two URLs):

   ```sql
   update products set image_url = replace(image_url, 'OLD-PROJECT-ID', 'NEW-PROJECT-ID');
   ```

6. Authentication → URL Configuration: set the Site URL and Redirect URLs to the app address, as when
   the app was first set up.
7. Render → the site → Environment: change `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the new
   project's values (Supabase → Project Settings → API), then **Manual Deploy**.
8. Phone notifications: redo the "Phone notifications" steps in the README for the new project
   (deploy `send-push`, set its secrets, run `schema_update_13.sql`'s vault lines).

Staff sign in with the same usernames and passwords as before. Invoice, receipt and refund numbers
carry on from where they were.

This was tested end to end on a copy: every order, payment, balance, stock level and login matched,
new orders continued the invoice numbers, and new sign-ups still worked.
