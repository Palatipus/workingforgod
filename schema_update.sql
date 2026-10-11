-- Run AFTER schema.sql. Adds signup approval, open inventory access, admin dashboard data.

-- 1. APPROVAL STATUS --------------------------------------------------
alter table profiles
  add column status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected'));

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'approved');
$$;

create or replace function is_approved() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

-- Auto-create a pending profile on signup and alert admins.
-- Pass full_name in signUp options.data so it lands in raw_user_meta_data.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.email);
begin
  insert into profiles (id, full_name) values (new.id, v_name);

  insert into notifications (user_id, message)
  select id, v_name || ' signed up and is waiting for approval' from profiles
  where role = 'admin' and status = 'approved';

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- Admin accepts or rejects (the app shows a confirmation dialog before calling this)
create or replace function set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid status'; end if;
  update profiles set status = p_status where id = p_user and role <> 'admin';
end;
$$;

-- 2. PERMISSIONS: only approved users get in -------------------------
drop policy if exists "read all" on profiles;
drop policy if exists "read all" on products;
drop policy if exists "read all" on customers;
drop policy if exists "read all" on orders;
drop policy if exists "read all" on order_items;
drop policy if exists "read all" on stock_in;
drop policy if exists "admin manages products" on products;
drop policy if exists "admin records stock in" on stock_in;
drop policy if exists "staff add customers" on customers;
drop policy if exists "admin upload photos" on storage.objects;

-- A pending user can still read their own profile (to see their status)
create policy "read profiles" on profiles for select to authenticated
  using (id = auth.uid() or is_approved());
create policy "read products" on products for select to authenticated using (is_approved());
create policy "read customers" on customers for select to authenticated using (is_approved());
create policy "read orders" on orders for select to authenticated using (is_approved());
create policy "read order items" on order_items for select to authenticated using (is_approved());
create policy "read stock in" on stock_in for select to authenticated using (is_approved());

-- Everyone approved (admin included) can add and edit inventory
create policy "add products" on products for insert to authenticated with check (is_approved());
create policy "edit products" on products for update to authenticated
  using (is_approved()) with check (is_approved());
create policy "delete products" on products for delete to authenticated using (is_admin());
create policy "record stock in" on stock_in for insert to authenticated with check (is_approved());
create policy "add customers" on customers for insert to authenticated with check (is_approved());
create policy "upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and is_approved());

-- Orders: any approved user, admin included, goes through create_order()
create or replace function create_order(p_customer_id uuid, p_items jsonb, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_stock int;
  v_take int;
  v_qty int;
  v_sales_name text;
  v_customer text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  insert into orders (customer_id, salesperson_id, notes)
  values (p_customer_id, auth.uid(), p_notes)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;

    select stock_qty into v_stock from products
    where id = (v_item->>'product_id')::uuid for update;

    v_take := least(v_stock, v_qty);

    update products set stock_qty = stock_qty - v_take
    where id = (v_item->>'product_id')::uuid;

    insert into order_items (order_id, product_id, qty, price, pending_qty)
    values (v_order_id, (v_item->>'product_id')::uuid, v_qty,
            (v_item->>'price')::numeric, v_qty - v_take);
  end loop;

  select full_name into v_sales_name from profiles where id = auth.uid();
  select name into v_customer from customers where id = p_customer_id;

  -- Alert every admin except the one who made the order
  insert into notifications (user_id, message, order_id)
  select id, 'New order by ' || v_sales_name || ' for ' || v_customer, v_order_id
  from profiles where role = 'admin' and status = 'approved' and id <> auth.uid();

  return v_order_id;
end;
$$;

-- 3. ADMIN DASHBOARD DATA ---------------------------------------------
-- Revenue = qty * price on every order line (owed items are already paid for)
create or replace function dashboard_stats() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_result json;
begin
  if not is_admin() then raise exception 'Admins only'; end if;

  select json_build_object(
    'revenue_this_month', coalesce((select sum(oi.qty * oi.price) from order_items oi
        join orders o on o.id = oi.order_id
        where o.created_at >= date_trunc('month', now())), 0),
    'revenue_last_month', coalesce((select sum(oi.qty * oi.price) from order_items oi
        join orders o on o.id = oi.order_id
        where o.created_at >= date_trunc('month', now()) - interval '1 month'
          and o.created_at <  date_trunc('month', now())), 0),
    'orders_this_month', (select count(*) from orders where created_at >= date_trunc('month', now())),
    'pending_deliveries', (select count(*) from order_items where pending_qty > 0),
    'low_stock_count', (select count(*) from products
        where is_active and stock_qty > 0 and stock_qty <= reorder_level),
    'out_of_stock_count', (select count(*) from products where is_active and stock_qty = 0),
    'total_products', (select count(*) from products where is_active),
    'pending_signups', (select count(*) from profiles where status = 'pending')
  ) into v_result;

  return v_result;
end;
$$;

-- Daily sales for the graph
create or replace function sales_by_day(p_days int default 30)
returns table (day date, total numeric, orders bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;

  return query
  select d::date, coalesce(sum(oi.qty * oi.price), 0), count(distinct o.id)
  from generate_series(current_date - (p_days - 1), current_date, interval '1 day') d
  left join orders o on o.created_at::date = d::date
  left join order_items oi on oi.order_id = o.id
  group by d
  order by d;
end;
$$;

-- Top products and top salespeople for dashboard cards
create or replace function top_products(p_limit int default 5)
returns table (product_name text, units bigint, revenue numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;

  return query
  select p.name, sum(oi.qty)::bigint, sum(oi.qty * oi.price)
  from order_items oi join products p on p.id = oi.product_id
  group by p.name order by sum(oi.qty * oi.price) desc limit p_limit;
end;
$$;

create or replace function top_salespeople(p_limit int default 5)
returns table (salesperson text, orders bigint, revenue numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;

  return query
  select pr.full_name, count(distinct o.id), sum(oi.qty * oi.price)
  from orders o join profiles pr on pr.id = o.salesperson_id
  join order_items oi on oi.order_id = o.id
  group by pr.full_name order by sum(oi.qty * oi.price) desc limit p_limit;
end;
$$;

-- FIRST ADMIN: sign up normally, then run this once with your own user id:
-- update profiles set role = 'admin', status = 'approved' where id = '<your-user-id>';
