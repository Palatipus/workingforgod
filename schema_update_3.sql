-- Run after schema_update_2.sql. Lets people sign in by username while auth uses their real email.

create or replace function email_for_username(p_username text) returns text
language sql security definer stable set search_path = public, auth as $$
  select u.email::text
  from profiles p join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;

create or replace function username_taken(p_username text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where lower(username) = lower(p_username));
$$;

grant execute on function email_for_username(text) to anon, authenticated;
grant execute on function username_taken(text) to anon, authenticated;
