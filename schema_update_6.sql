-- Run after schema_update_5.sql.
-- Deliveries take stock, orders can be cancelled, payments reversed, team managed, safer username login,
-- stock can only change through stock received / orders / deliveries, customer editing, overdue tracking.

-- 1. ORDER CANCELLATION -------------------------------------------------
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancelled_by uuid references profiles(id);
alter table orders add column if not exists cancel_reason text;

-- Cancelled orders count as zero
create or replace view order_totals with (security_invoker = true) as
select o.id as order_id, o.customer_id,
  case when o.cancelled_at is null then coalesce(i.total, 0) else 0 end as total,
  coalesce(p.paid, 0) as paid,
  case when o.cancelled_at is null then coalesce(i.total, 0) else 0 end - coalesce(p.paid, 0) as balance
from orders o
left join (select order_id, sum(qty * price) as total from order_items group by order_id) i on i.order_id = o.id
left join (select order_id, sum(amount) as paid from payments group by order_id) p on p.order_id = o.id;

create or replace view customer_balances with (security_invoker = true) as
select c.id as customer_id, c.name, c.phone, c.location,
  count(o.id) filter (where o.cancelled_at is null) as orders,
  coalesce(sum(t.total), 0) as total,
  coalesce(sum(t.paid), 0) as paid,
  coalesce(sum(t.balance), 0) as owed,
  coalesce(sum(t.balance) filter (where o.due_date < current_date and t.balance > 0), 0) as overdue,
  c.email
from customers c
left join orders o on o.customer_id = c.id
left join order_totals t on t.order_id = o.id
group by c.id;

-- One row per order for the Orders list (search, filters and paging happen in the database)
create or replace view order_list with (security_invoker = true) as
select o.id, o.order_number,
  'INV' || case when o.order_number < 1000 then lpad(o.order_number::text, 4, '0') else o.order_number::text end as invoice_number,
  o.created_at, o.due_date, o.cancelled_at, o.customer_id,
  c.name as customer_name, pr.full_name as salesperson,
  t.total, t.paid, t.balance,
  exists (select 1 from order_items oi where oi.order_id = o.id and oi.pending_qty > 0) as has_pending,
  (o.cancelled_at is null and t.balance > 0 and o.due_date < current_date) as overdue
from orders o
join customers c on c.id = o.customer_id
join profiles pr on pr.id = o.salesperson_id
join order_totals t on t.order_id = o.id;

create or replace function cancel_order(p_order_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_salesperson uuid;
  v_number bigint;
begin
  if not is_admin() then raise exception 'Only an admin can cancel orders'; end if;

  select salesperson_id, order_number into v_salesperson, v_number
  from orders where id = p_order_id and cancelled_at is null for update;
  if not found then raise exception 'Order not found or already cancelled'; end if;

  if exists (select 1 from payments where order_id = p_order_id) then
    raise exception 'Reverse the payments on this order before cancelling it';
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

  if v_salesperson <> auth.uid() then
    insert into notifications (user_id, message, order_id)
    values (v_salesperson, 'Invoice INV' || case when v_number < 1000 then lpad(v_number::text, 4, '0') else v_number::text end ||
      ' was cancelled by an admin', p_order_id);
  end if;
end;
$$;

-- create_order: checks every item BEFORE taking an invoice number, so rejected orders leave no gaps
create or replace function create_order(
  p_customer_id uuid, p_items jsonb, p_notes text default null,
  p_amount_paid numeric default 0, p_method text default 'cash', p_due_date date default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_stock int;
  v_take int;
  v_qty int;
  v_price numeric;
  v_total numeric := 0;
  v_prev numeric;
  v_sales_name text;
  v_customer text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one item'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'Customer not found'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    v_price := (v_item->>'price')::numeric;
    if v_qty is null or v_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
    if v_price is null or v_price <= 0 then raise exception 'Price must be above 0'; end if;
    if not exists (select 1 from products where id = (v_item->>'product_id')::uuid and is_active) then
      raise exception 'A product in this order is no longer available';
    end if;
    v_total := v_total + v_qty * round(v_price, 2);
  end loop;

  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > v_total then
    raise exception 'Amount paid must be between 0 and the order total';
  end if;

  select coalesce(sum(balance), 0) into v_prev from order_totals where customer_id = p_customer_id;

  insert into orders (customer_id, salesperson_id, notes, previous_balance, due_date)
  values (p_customer_id, auth.uid(), nullif(trim(p_notes), ''), v_prev, p_due_date)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;

    select stock_qty into v_stock from products
    where id = (v_item->>'product_id')::uuid for update;

    v_take := least(v_stock, v_qty);

    update products set stock_qty = stock_qty - v_take
    where id = (v_item->>'product_id')::uuid;

    insert into order_items (order_id, product_id, qty, price, pending_qty)
    values (v_order_id, (v_item->>'product_id')::uuid, v_qty, (v_item->>'price')::numeric, v_qty - v_take);
  end loop;

  if p_amount_paid > 0 then
    insert into payments (order_id, amount, method, recorded_by)
    values (v_order_id, p_amount_paid, p_method, auth.uid());
  end if;

  select full_name into v_sales_name from profiles where id = auth.uid();
  select name into v_customer from customers where id = p_customer_id;

  insert into notifications (user_id, message, order_id)
  select id,
    'New order by ' || v_sales_name || ' for ' || v_customer ||
      case when p_amount_paid < v_total then ' (balance GHS ' || (v_total - p_amount_paid) || ')' else '' end,
    v_order_id
  from profiles where role = 'admin' and status = 'approved' and id <> auth.uid();

  return v_order_id;
end;
$$;

-- Payments can be reversed by an admin (e.g. typed wrongly)
create or replace function reverse_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can reverse payments'; end if;
  delete from payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
end;
$$;

create or replace function record_order_payment(
  p_order_id uuid, p_amount numeric, p_method text default 'cash', p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if exists (select 1 from orders where id = p_order_id and cancelled_at is not null) then
    raise exception 'This order was cancelled';
  end if;

  select balance into v_balance from order_totals where order_id = p_order_id;
  if v_balance is null then raise exception 'Order not found'; end if;
  if p_amount <= 0 or p_amount > v_balance then
    raise exception 'Amount must be above 0 and at most the balance of %', v_balance;
  end if;

  insert into payments (order_id, amount, method, note, recorded_by)
  values (p_order_id, p_amount, p_method, p_note, auth.uid());
end;
$$;

-- 2. DELIVERIES TAKE STOCK (and can be partial) -------------------------
drop function if exists mark_delivered(uuid);

create or replace function mark_delivered(p_item_id uuid, p_qty int default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item order_items;
  v_qty int;
  v_stock int;
  v_name text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select * into v_item from order_items where id = p_item_id for update;
  if v_item.id is null or v_item.pending_qty = 0 then raise exception 'Nothing left to deliver on this item'; end if;
  if exists (select 1 from orders where id = v_item.order_id and cancelled_at is not null) then
    raise exception 'This order was cancelled';
  end if;

  v_qty := coalesce(p_qty, v_item.pending_qty);
  if v_qty < 1 or v_qty > v_item.pending_qty then
    raise exception 'Deliver between 1 and %', v_item.pending_qty;
  end if;

  select stock_qty, name into v_stock, v_name from products where id = v_item.product_id for update;
  if v_stock < v_qty then
    raise exception 'Only % % in stock. Record the stock you received first.', v_stock, v_name;
  end if;

  update products set stock_qty = stock_qty - v_qty where id = v_item.product_id;
  update order_items set pending_qty = pending_qty - v_qty,
    delivered_at = case when pending_qty - v_qty = 0 then now() else delivered_at end
  where id = p_item_id;
end;
$$;

-- 3. STOCK ONLY CHANGES THROUGH STOCK RECEIVED, ORDERS AND DELIVERIES -----
-- Direct API edits run as the "authenticated" role; the functions above run as the owner and are allowed.
create or replace function apply_stock_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update products set stock_qty = stock_qty + new.qty where id = new.product_id;
  return new;
end;
$$;

create or replace function guard_product_changes() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.stock_qty <> 0 then
      raise exception 'Add opening stock through stock received';
    end if;
    if tg_op = 'UPDATE' and new.stock_qty is distinct from old.stock_qty then
      raise exception 'Stock can only change through stock received, orders or deliveries';
    end if;
    if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active and not is_admin() then
      raise exception 'Only an admin can remove products';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_products on products;
create trigger trg_guard_products before insert or update on products
for each row execute function guard_product_changes();

-- 4. TEAM MANAGEMENT ----------------------------------------------------
create or replace function set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own access'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid status'; end if;
  update profiles set status = p_status where id = p_user;
end;
$$;

create or replace function set_user_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role not in ('admin', 'salesperson') then raise exception 'Invalid role'; end if;
  update profiles set role = p_role where id = p_user and status = 'approved';
  if not found then raise exception 'Only approved users can be given a role'; end if;
end;
$$;

-- Let the app notice straight away when someone's access changes
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table profiles;
  end if;
end $$;

-- 5. SAFER USERNAME LOGIN -------------------------------------------------
-- The old lookup returned anyone's email for a username. Now the email is only returned with the right password,
-- and a username is locked for 15 minutes after 10 wrong attempts.
drop function if exists email_for_username(text);

create table if not exists login_attempts (
  username text not null,
  attempted_at timestamptz not null default now()
);
alter table login_attempts enable row level security;

create or replace function email_for_login(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_name text := lower(trim(p_username));
  v_email text;
  v_hash text;
begin
  delete from login_attempts where attempted_at < now() - interval '1 day';

  if (select count(*) from login_attempts
      where username = v_name and attempted_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many attempts. Try again in 15 minutes.';
  end if;

  select u.email::text, u.encrypted_password into v_email, v_hash
  from profiles p join auth.users u on u.id = p.id
  where lower(p.username) = v_name
  limit 1;

  if v_hash is not null and v_hash = crypt(p_password, v_hash) then
    delete from login_attempts where username = v_name;
    return v_email;
  end if;

  insert into login_attempts (username) values (v_name);
  return null;
end;
$$;

grant execute on function email_for_login(text, text) to anon, authenticated;

-- 6. CUSTOMERS CAN BE EDITED ------------------------------------------------
drop policy if exists "edit customers" on customers;
create policy "edit customers" on customers for update to authenticated
  using (is_approved()) with check (is_approved());

-- 7. LAST PRICE USED (prefills prices on new orders) ------------------------
create or replace function last_prices(p_customer_id uuid)
returns table (product_id uuid, price numeric, for_customer boolean)
language sql stable set search_path = public as $$
  select distinct on (oi.product_id) oi.product_id, oi.price, (o.customer_id = p_customer_id)
  from order_items oi join orders o on o.id = oi.order_id
  where o.cancelled_at is null
  order by oi.product_id, (o.customer_id = p_customer_id) desc, o.created_at desc;
$$;

-- 8. DASHBOARD: ignore cancelled orders, add cash collected and overdue -------
create or replace function dashboard_stats() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_result json;
begin
  if not is_admin() then raise exception 'Admins only'; end if;

  select json_build_object(
    'revenue_this_month', coalesce((select sum(oi.qty * oi.price) from order_items oi
        join orders o on o.id = oi.order_id
        where o.cancelled_at is null and o.created_at >= date_trunc('month', now())), 0),
    'revenue_last_month', coalesce((select sum(oi.qty * oi.price) from order_items oi
        join orders o on o.id = oi.order_id
        where o.cancelled_at is null
          and o.created_at >= date_trunc('month', now()) - interval '1 month'
          and o.created_at <  date_trunc('month', now())), 0),
    'cash_this_month', coalesce((select sum(amount) from payments
        where paid_at >= date_trunc('month', now())), 0),
    'cash_last_month', coalesce((select sum(amount) from payments
        where paid_at >= date_trunc('month', now()) - interval '1 month'
          and paid_at <  date_trunc('month', now())), 0),
    'orders_this_month', (select count(*) from orders
        where cancelled_at is null and created_at >= date_trunc('month', now())),
    'pending_deliveries', (select count(*) from order_items where pending_qty > 0),
    'low_stock_count', (select count(*) from products
        where is_active and stock_qty > 0 and stock_qty <= reorder_level),
    'out_of_stock_count', (select count(*) from products where is_active and stock_qty = 0),
    'total_products', (select count(*) from products where is_active),
    'pending_signups', (select count(*) from profiles where status = 'pending'),
    'outstanding_debt', coalesce((select sum(balance) from order_totals where balance > 0), 0),
    'customers_owing', (select count(distinct customer_id) from order_totals where balance > 0),
    'overdue_amount', coalesce((select sum(t.balance) from order_totals t join orders o on o.id = t.order_id
        where t.balance > 0 and o.due_date < current_date), 0)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function sales_by_day(p_days int default 30)
returns table (day date, total numeric, orders bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;

  return query
  select d::date, coalesce(sum(oi.qty * oi.price), 0), count(distinct o.id)
  from generate_series(current_date - (p_days - 1), current_date, interval '1 day') d
  left join orders o on o.created_at::date = d::date and o.cancelled_at is null
  left join order_items oi on oi.order_id = o.id
  group by d
  order by d;
end;
$$;

create or replace function top_products(p_limit int default 5)
returns table (product_name text, units bigint, revenue numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;

  return query
  select p.name, sum(oi.qty)::bigint, sum(oi.qty * oi.price)
  from order_items oi
  join orders o on o.id = oi.order_id and o.cancelled_at is null
  join products p on p.id = oi.product_id
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
  where o.cancelled_at is null
  group by pr.full_name order by sum(oi.qty * oi.price) desc limit p_limit;
end;
$$;
