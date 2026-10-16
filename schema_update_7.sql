-- Run after schema_update_6.sql. Any approved user can cancel orders; everyone can pick or change their username.

-- 1. CANCEL ORDERS: any approved user (reversing payments stays admin-only)
create or replace function cancel_order(p_order_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_salesperson uuid;
  v_number bigint;
  v_invoice text;
  v_by text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select salesperson_id, order_number into v_salesperson, v_number
  from orders where id = p_order_id and cancelled_at is null for update;
  if not found then raise exception 'Order not found or already cancelled'; end if;

  if exists (select 1 from payments where order_id = p_order_id) then
    raise exception 'This order has payments. An admin must reverse them before it can be cancelled';
  end if;

  -- Put back what actually left the shelf (ordered minus still owed)
  for r in select product_id, qty - pending_qty as taken from order_items where order_id = p_order_id loop
    if r.taken > 0 then
      update products set stock_qty = stock_qty + r.taken where id = r.product_id;
    end if;
  end loop;

  update order_items set pending_qty = 0 where order_id = p_order_id;
  update orders set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '')
  where id = p_order_id;

  v_invoice := 'INV' || case when v_number < 1000 then lpad(v_number::text, 4, '0') else v_number::text end;
  select full_name into v_by from profiles where id = auth.uid();

  -- Tell the person who made the sale and every admin, except whoever cancelled it
  insert into notifications (user_id, message, order_id)
  select id, 'Invoice ' || v_invoice || ' was cancelled by ' || v_by ||
    coalesce(': ' || nullif(trim(p_reason), ''), ''), p_order_id
  from profiles
  where status = 'approved' and id <> auth.uid() and (id = v_salesperson or role = 'admin');
end;
$$;

-- 2. USERNAMES: letters, numbers, dot, underscore, hyphen; 3-30 characters; not case sensitive
create or replace function valid_username(p_username text) returns boolean
language sql immutable as $$
  select p_username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$';
$$;

-- Lets a signed-in user choose or change their own username
create or replace function set_my_username(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not valid_username(v_name) then
    raise exception 'Username must be 3-30 characters: letters, numbers, dots, dashes or underscores';
  end if;
  if exists (select 1 from profiles where lower(username) = v_name and id <> auth.uid()) then
    raise exception 'That username is already taken';
  end if;
  update profiles set username = v_name where id = auth.uid();
end;
$$;

-- Admins can set a username for someone else (e.g. staff who signed up before usernames existed)
create or replace function set_user_username(p_user uuid, p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := lower(trim(p_username));
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not valid_username(v_name) then
    raise exception 'Username must be 3-30 characters: letters, numbers, dots, dashes or underscores';
  end if;
  if exists (select 1 from profiles where lower(username) = v_name and id <> p_user) then
    raise exception 'That username is already taken';
  end if;
  update profiles set username = v_name where id = p_user;
end;
$$;

grant execute on function set_my_username(text) to authenticated;
grant execute on function set_user_username(uuid, text) to authenticated;
