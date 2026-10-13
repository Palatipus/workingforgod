-- Run after schema_update_12.sql.
-- Phone notifications: every row added to notifications is also sent as a push notification
-- to each phone/computer where that person turned notifications on.
-- Before running, do the "Phone notifications" steps in README.md (deploy the send-push function
-- and fill in the two vault secrets at the bottom of this file).

-- 1. DEVICES THAT RECEIVE PUSH NOTIFICATIONS ------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "own devices" on push_subscriptions;
create policy "own devices" on push_subscriptions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "remove own devices" on push_subscriptions;
create policy "remove own devices" on push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Save this device for the signed-in user. A shared phone moves to whoever signed in last.
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
grant execute on function save_push_subscription(text, text, text) to authenticated;

-- 2. SEND A PUSH FOR EVERY NEW NOTIFICATION ---------------------------------------------------
create extension if not exists pg_net;

create or replace function push_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from push_subscriptions where user_id = new.user_id) then
    return new;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
  if v_url is null then return new; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(v_secret, '')),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
exception when others then
  -- A push problem must never stop an order, payment or approval from saving
  return new;
end;
$$;

drop trigger if exists push_notification on notifications;
create trigger push_notification after insert on notifications
  for each row execute function push_notification();

-- 3. WHERE TO SEND THEM (run once, with your own values) ----------------------------------------
-- select vault.create_secret('https://YOUR-PROJECT.supabase.co/functions/v1/send-push', 'push_function_url');
-- select vault.create_secret('THE-SAME-PUSH_SECRET-YOU-SET-ON-THE-FUNCTION', 'push_secret');
