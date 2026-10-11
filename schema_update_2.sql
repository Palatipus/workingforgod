-- Run after schema.sql and schema_update.sql. Adds usernames.
alter table profiles add column username text;
create unique index profiles_username_key on profiles (lower(username));

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.email);
begin
  insert into profiles (id, full_name, username)
  values (new.id, v_name, lower(new.raw_user_meta_data->>'username'));

  insert into notifications (user_id, message)
  select id, v_name || ' signed up and is waiting for approval' from profiles
  where role = 'admin' and status = 'approved';

  return new;
end;
$$;
