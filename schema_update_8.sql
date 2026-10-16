-- Run after schema_update_7.sql.
-- Stock history and adjustments, receipts, paying old debt at checkout, low-stock alerts, salesperson stats.

-- 1. NOTIFICATIONS CAN LINK ANYWHERE IN THE APP ------------------------------
alter table notifications add column if not exists link text;

-- 2. STOCK HISTORY ------------------------------------------------------------
-- Every change to a product's stock is written here by a trigger. Functions that change stock
-- say why through transaction settings (app.move_kind, app.move_order, app.move_note).
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  change int not null,
  balance_after int not null,
  kind text not null check (kind in ('opening', 'received', 'sale', 'delivery', 'cancel', 'adjustment')),
  order_id uuid references orders(id) on delete set null,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on stock_movements (product_id, created_at desc);

alter table stock_movements enable row level security;
drop policy if exists "read stock movements" on stock_movements;
create policy "read stock movements" on stock_movements for select to authenticated using (is_approved());

create or replace function set_move(p_kind text, p_order uuid default null, p_note text default null) returns void
language sql as $$
  select set_config('app.move_kind', p_kind, true),
         set_config('app.move_order', coalesce(p_order::text, ''), true),
         set_config('app.move_note', coalesce(p_note, ''), true);
$$;

create or replace function log_stock_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stock_qty is distinct from old.stock_qty then
    insert into stock_movements (product_id, change, balance_after, kind, order_id, note, created_by)
    values (new.id, new.stock_qty - old.stock_qty, new.stock_qty,
      coalesce(nullif(current_setting('app.move_kind', true), ''), 'adjustment'),
      nullif(current_setting('app.move_order', true), '')::uuid,
      nullif(current_setting('app.move_note', true), ''),
      auth.uid());

    -- Low stock alert for admins when a product crosses its reorder level
    if new.is_active and new.stock_qty <= new.reorder_level and old.stock_qty > new.reorder_level then
      insert into notifications (user_id, message, link)
      select id,
        case when new.stock_qty = 0 then new.name || ' is out of stock'
             else new.name || ' is running low: ' || new.stock_qty || ' left' end,
        '/inventory?product=' || new.id
      from profiles where role = 'admin' and status = 'approved';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_stock on products;
create trigger trg_log_stock after update on products
for each row execute function log_stock_change();

-- History starts from today's stock levels
insert into stock_movements (product_id, change, balance_after, kind, note)
select p.id, p.stock_qty, p.stock_qty, 'opening', 'Stock when history started'
from products p
where p.stock_qty <> 0 and not exists (select 1 from stock_movements m where m.product_id = p.id);

create or replace function apply_stock_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_move('received', null, new.supplier);
  update products set stock_qty = stock_qty + new.qty where id = new.product_id;
  return new;
end;
$$;

-- 3. STOCK ADJUSTMENTS (admin) ---------------------------------------------------
create or replace function adjust_stock(p_product_id uuid, p_change int, p_reason text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
  v_label text;
begin
  if not is_admin() then raise exception 'Only an admin can adjust stock'; end if;
  if p_change is null or p_change = 0 then raise exception 'Enter how many to add or remove'; end if;

  v_label := case p_reason
    when 'correction' then 'Correction' when 'damaged' then 'Damaged' when 'expired' then 'Expired'
    when 'lost' then 'Lost or missing' when 'returned' then 'Returned to supplier' when 'other' then 'Other' end;
  if v_label is null then raise exception 'Choose a reason'; end if;

  select stock_qty into v_stock from products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_stock + p_change < 0 then raise exception 'Only % in stock, so you cannot remove %', v_stock, -p_change; end if;

  perform set_move('adjustment', null, v_label || coalesce(': ' || nullif(trim(p_note), ''), ''));
  update products set stock_qty = stock_qty + p_change where id = p_product_id;
end;
$$;

-- 4. RECEIPTS -----------------------------------------------------------------------
-- One receipt per amount received. A receipt can be spread over several invoices (payments rows).
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number bigint generated always as identity,
  customer_id uuid not null references customers(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'mobile_money', 'bank_transfer', 'other')),
  note text,
  balance_after numeric(12,2),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references profiles(id)
);

alter table receipts enable row level security;
drop policy if exists "read receipts" on receipts;
create policy "read receipts" on receipts for select to authenticated using (is_approved());

alter table payments add column if not exists receipt_id uuid references receipts(id) on delete cascade;

-- Give every existing payment its own receipt
do $$
declare
  r record;
  v_id uuid;
begin
  for r in
    select p.id, p.amount, p.method, p.note, p.recorded_by, p.paid_at, o.customer_id
    from payments p join orders o on o.id = p.order_id
    where p.receipt_id is null
    order by p.paid_at
  loop
    insert into receipts (customer_id, amount, method, note, created_by, created_at)
    values (r.customer_id, r.amount, r.method, r.note, r.recorded_by, r.paid_at)
    returning id into v_id;
    update payments set receipt_id = v_id where id = r.id;
  end loop;
end $$;

-- Spreads an amount over a customer's unpaid orders, oldest first, under one receipt
create or replace function pay_oldest_orders(p_receipt uuid, p_customer uuid, p_amount numeric,
  p_method text, p_note text, p_skip uuid default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_left numeric := p_amount;
  v_take numeric;
  r record;
begin
  for r in
    select t.order_id, t.balance
    from order_totals t join orders o on o.id = t.order_id
    where t.customer_id = p_customer and t.balance > 0 and o.cancelled_at is null
      and (p_skip is null or t.order_id <> p_skip)
    order by o.created_at
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.balance);
    insert into payments (order_id, amount, method, note, recorded_by, receipt_id)
    values (r.order_id, v_take, p_method, p_note, auth.uid(), p_receipt);
    v_left := v_left - v_take;
  end loop;
  return v_left;
end;
$$;
revoke execute on function pay_oldest_orders(uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;

create or replace function customer_owed(p_customer uuid) returns numeric
language sql stable set search_path = public as $$
  select coalesce(sum(balance), 0) from order_totals where customer_id = p_customer and balance > 0;
$$;

-- Payment against one order: returns the receipt id
drop function if exists record_order_payment(uuid, numeric, text, text);
create or replace function record_order_payment(
  p_order_id uuid, p_amount numeric, p_method text default 'cash', p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
  v_customer uuid;
  v_receipt uuid;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select o.customer_id, t.balance into v_customer, v_balance
  from orders o join order_totals t on t.order_id = o.id
  where o.id = p_order_id and o.cancelled_at is null;
  if v_customer is null then raise exception 'Order not found or cancelled'; end if;
  if p_amount <= 0 or p_amount > v_balance then
    raise exception 'Amount must be above 0 and at most the balance of %', v_balance;
  end if;

  insert into receipts (customer_id, amount, method, note, created_by)
  values (v_customer, p_amount, p_method, nullif(trim(p_note), ''), auth.uid())
  returning id into v_receipt;

  insert into payments (order_id, amount, method, note, recorded_by, receipt_id)
  values (p_order_id, p_amount, p_method, nullif(trim(p_note), ''), auth.uid(), v_receipt);

  update receipts set balance_after = customer_owed(v_customer) where id = v_receipt;
  return v_receipt;
end;
$$;

-- Payment from a customer, clearing their oldest unpaid orders first: returns the receipt id
drop function if exists record_customer_payment(uuid, numeric, text, text);
create or replace function record_customer_payment(
  p_customer_id uuid, p_amount numeric, p_method text default 'cash', p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owed numeric;
  v_receipt uuid;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  v_owed := customer_owed(p_customer_id);
  if p_amount <= 0 or p_amount > v_owed then
    raise exception 'Amount must be above 0 and at most the amount owed of %', v_owed;
  end if;

  insert into receipts (customer_id, amount, method, note, created_by)
  values (p_customer_id, p_amount, p_method, nullif(trim(p_note), ''), auth.uid())
  returning id into v_receipt;

  perform pay_oldest_orders(v_receipt, p_customer_id, p_amount, p_method, nullif(trim(p_note), ''));

  update receipts set balance_after = customer_owed(p_customer_id) where id = v_receipt;
  return v_receipt;
end;
$$;

-- Reversing undoes the whole receipt (all invoices it paid)
create or replace function reverse_receipt(p_receipt_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can reverse payments'; end if;
  update receipts set reversed_at = now(), reversed_by = auth.uid()
  where id = p_receipt_id and reversed_at is null;
  if not found then raise exception 'Receipt not found or already reversed'; end if;
  delete from payments where receipt_id = p_receipt_id;
end;
$$;

create or replace function reverse_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_receipt uuid;
begin
  if not is_admin() then raise exception 'Only an admin can reverse payments'; end if;
  select receipt_id into v_receipt from payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_receipt is null then
    delete from payments where id = p_payment_id;
  else
    perform reverse_receipt(v_receipt);
  end if;
end;
$$;

-- 5. CREATE ORDER: pay old debt at checkout, receipts, stock history -------------------
-- Money received goes to this order first; anything above its total clears earlier debt, oldest first.
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
  v_on_order numeric;
  v_extra numeric;
  v_receipt uuid;
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

  v_prev := customer_owed(p_customer_id);

  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > v_total + v_prev then
    raise exception 'Amount paid must be between 0 and %', v_total + v_prev;
  end if;

  v_on_order := least(p_amount_paid, v_total);
  v_extra := p_amount_paid - v_on_order;

  insert into orders (customer_id, salesperson_id, notes, previous_balance, due_date)
  values (p_customer_id, auth.uid(), nullif(trim(p_notes), ''), v_prev - v_extra, p_due_date)
  returning id into v_order_id;

  perform set_move('sale', v_order_id, null);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;

    select stock_qty into v_stock from products
    where id = (v_item->>'product_id')::uuid for update;

    v_take := least(v_stock, v_qty);

    if v_take > 0 then
      update products set stock_qty = stock_qty - v_take
      where id = (v_item->>'product_id')::uuid;
    end if;

    insert into order_items (order_id, product_id, qty, price, pending_qty)
    values (v_order_id, (v_item->>'product_id')::uuid, v_qty, (v_item->>'price')::numeric, v_qty - v_take);
  end loop;

  if p_amount_paid > 0 then
    insert into receipts (customer_id, amount, method, created_by)
    values (p_customer_id, p_amount_paid, p_method, auth.uid())
    returning id into v_receipt;

    if v_on_order > 0 then
      insert into payments (order_id, amount, method, recorded_by, receipt_id)
      values (v_order_id, v_on_order, p_method, auth.uid(), v_receipt);
    end if;

    if v_extra > 0 then
      perform pay_oldest_orders(v_receipt, p_customer_id, v_extra, p_method, 'Paid with a new order', v_order_id);
    end if;

    update receipts set balance_after = customer_owed(p_customer_id) where id = v_receipt;
  end if;

  select full_name into v_sales_name from profiles where id = auth.uid();
  select name into v_customer from customers where id = p_customer_id;

  insert into notifications (user_id, message, order_id)
  select id,
    'New order by ' || v_sales_name || ' for ' || v_customer ||
      case when v_on_order < v_total then ' (balance GHS ' || (v_total - v_on_order) || ')' else '' end,
    v_order_id
  from profiles where role = 'admin' and status = 'approved' and id <> auth.uid();

  return v_order_id;
end;
$$;

-- 6. DELIVERIES AND CANCELLATIONS RECORD WHY STOCK CHANGED ------------------------------
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

  perform set_move('delivery', v_item.order_id, null);
  update products set stock_qty = stock_qty - v_qty where id = v_item.product_id;
  update order_items set pending_qty = pending_qty - v_qty,
    delivered_at = case when pending_qty - v_qty = 0 then now() else delivered_at end
  where id = p_item_id;
end;
$$;

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

  perform set_move('cancel', p_order_id, nullif(trim(p_reason), ''));
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

  insert into notifications (user_id, message, order_id)
  select id, 'Invoice ' || v_invoice || ' was cancelled by ' || v_by ||
    coalesce(': ' || nullif(trim(p_reason), ''), ''), p_order_id
  from profiles
  where status = 'approved' and id <> auth.uid() and (id = v_salesperson or role = 'admin');
end;
$$;

-- 7. SALESPERSON DASHBOARD ---------------------------------------------------------------
-- Adds salesperson_id to the order list (appended so the view can be replaced in place)
create or replace view order_list with (security_invoker = true) as
select o.id, o.order_number,
  'INV' || case when o.order_number < 1000 then lpad(o.order_number::text, 4, '0') else o.order_number::text end as invoice_number,
  o.created_at, o.due_date, o.cancelled_at, o.customer_id,
  c.name as customer_name, pr.full_name as salesperson,
  t.total, t.paid, t.balance,
  exists (select 1 from order_items oi where oi.order_id = o.id and oi.pending_qty > 0) as has_pending,
  (o.cancelled_at is null and t.balance > 0 and o.due_date < current_date) as overdue,
  o.salesperson_id
from orders o
join customers c on c.id = o.customer_id
join profiles pr on pr.id = o.salesperson_id
join order_totals t on t.order_id = o.id;

create or replace function my_stats() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_result json;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select json_build_object(
    'sales_this_month', coalesce((select sum(oi.qty * oi.price) from order_items oi
        join orders o on o.id = oi.order_id
        where o.salesperson_id = v_me and o.cancelled_at is null and o.created_at >= date_trunc('month', now())), 0),
    'sales_last_month', coalesce((select sum(oi.qty * oi.price) from order_items oi
        join orders o on o.id = oi.order_id
        where o.salesperson_id = v_me and o.cancelled_at is null
          and o.created_at >= date_trunc('month', now()) - interval '1 month'
          and o.created_at < date_trunc('month', now())), 0),
    'orders_this_month', (select count(*) from orders
        where salesperson_id = v_me and cancelled_at is null and created_at >= date_trunc('month', now())),
    'cash_this_month', coalesce((select sum(amount) from payments
        where recorded_by = v_me and paid_at >= date_trunc('month', now())), 0),
    'owed_on_my_orders', coalesce((select sum(t.balance) from order_totals t join orders o on o.id = t.order_id
        where o.salesperson_id = v_me and t.balance > 0), 0),
    'overdue_on_my_orders', coalesce((select sum(t.balance) from order_totals t join orders o on o.id = t.order_id
        where o.salesperson_id = v_me and t.balance > 0 and o.due_date < current_date), 0),
    'pending_on_my_orders', (select count(*) from order_items oi join orders o on o.id = oi.order_id
        where o.salesperson_id = v_me and oi.pending_qty > 0)
  ) into v_result;

  return v_result;
end;
$$;

-- Realtime for the new tables
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'stock_movements') then
    alter publication supabase_realtime add table stock_movements;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'products') then
    alter publication supabase_realtime add table products;
  end if;
end $$;
