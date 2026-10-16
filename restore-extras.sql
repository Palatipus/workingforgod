-- Run LAST when restoring a backup into a new Supabase project (see RESTORE.md).
-- Recreates what lives outside the app's own tables, so the backup files don't include it.

-- New sign-ups get a profile (waiting for approval)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- Product photos bucket
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;
drop policy if exists "public read photos" on storage.objects;
create policy "public read photos" on storage.objects for select
  using (bucket_id = 'product-images');
drop policy if exists "upload photos" on storage.objects;
create policy "upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and is_approved());

-- Live updates in the app
do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_items', 'notifications', 'payments', 'profiles', 'stock_movements',
    'products', 'refunds', 'order_returns', 'pending_orders', 'receipts'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
