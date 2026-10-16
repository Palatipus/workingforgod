-- Run after schema_update_13.sql.
-- Pending orders (saved without prices, finished later; their stock is held meanwhile)
-- and extra charges on orders that are not products (service fee, delivery, ...).

-- 1. EXTRA CHARGES: ORDER LINES WITHOUT A PRODUCT ----------------------------------------------
-- A line with no product is an extra charge. Its description is kept in product_name.
alter table order_items alter column product_id drop not null;
alter table order_items drop constraint if exists order_items_named_check;
alter table order_items add constraint order_items_named_check
  check (product_id is not null or nullif(trim(product_name), '') is not null);

create or replace function snapshot_item_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null then
    select name into new.product_name from products where id = new.product_id;
  end if;
  return new;
end;
$$;

create or replace function last_prices(p_customer_id uuid)
returns table (product_id uuid, price numeric, for_customer boolean)
language sql stable set search_path = public as $$
  select distinct on (oi.product_id) oi.product_id, oi.price, (o.customer_id = p_customer_id)
  from order_items oi join orders o on o.id = oi.order_id
  where o.cancelled_at is null and oi.product_id is not null
  order by oi.product_id, (o.customer_id = p_customer_id) desc, o.created_at desc;
$$;

-- 2. PENDING ORDERS -----------------------------------------------------------------------------
create table if not exists pending_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  salesperson_id uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

create table if not exists pending_order_items (
  id uuid primary key default gen_random_uuid(),
  pending_id uuid not null references pending_orders(id) on delete cascade,
  position int not null default 0,
  product_id uuid references products(id),
  name text,                                       -- description of an extra charge
  qty int not null check (qty > 0),
  price numeric(12,2) check (price > 0),           -- blank until someone knows the price
  held_qty int not null default 0 check (held_qty >= 0),
  constraint pending_order_items_named_check check (product_id is not null or nullif(trim(name), '') is not null)
);
create index if not exists pending_order_items_pending_idx on pending_order_items (pending_id);
create index if not exists pending_order_items_product_idx on pending_order_items (product_id) where held_qty > 0;

alter table pending_orders enable row level security;
alter table pending_order_items enable row level security;
drop policy if exists "read pending orders" on pending_orders;
create policy "read pending orders" on pending_orders for select to authenticated using (is_approved());
drop policy if exists "read pending order items" on pending_order_items;
create policy "read pending order items" on pending_order_items for select to authenticated using (is_approved());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pending_orders') then
    alter publication supabase_realtime add table pending_orders;
  end if;
end $$;

-- 3. STOCK HISTORY KNOWS ABOUT HELD STOCK ------------------------------------------------------
alter table stock_movements add column if not exists pending_id uuid references pending_orders(id) on delete set null;
alter table stock_movements drop constraint if exists stock_movements_kind_check;
alter table stock_movements add constraint stock_movements_kind_check
  check (kind in ('opening', 'received', 'sale', 'delivery', 'cancel', 'adjustment', 'return', 'hold', 'release'));

create or replace function set_move(p_kind text, p_order uuid default null, p_note text default null) returns void
language sql as $$
  select set_config('app.move_kind', p_kind, true),
         set_config('app.move_order', coalesce(p_order::text, ''), true),
         set_config('app.move_note', coalesce(p_note, ''), true),
         set_config('app.move_pending', '', true);
$$;

create or replace function set_move_pending(p_kind text, p_pending uuid, p_note text default null) returns void
language sql as $$
  select set_move(p_kind, null, p_note);
  select set_config('app.move_pending', coalesce(p_pending::text, ''), true);
$$;

create or replace function log_stock_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stock_qty is distinct from old.stock_qty then
    insert into stock_movements (product_id, change, balance_after, kind, order_id, note, created_by, pending_id)
    values (new.id, new.stock_qty - old.stock_qty, new.stock_qty,
      coalesce(nullif(current_setting('app.move_kind', true), ''), 'adjustment'),
      nullif(current_setting('app.move_order', true), '')::uuid,
      nullif(current_setting('app.move_note', true), ''),
      auth.uid(),
      nullif(current_setting('app.move_pending', true), '')::uuid);

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

-- 4. CHECK THE LINES OF AN ORDER --------------------------------------------------------------
-- Product lines need an active product; extra charges need a description. Prices may be blank
-- only when p_prices_required is false (pending orders).
create or replace function check_order_lines(p_items jsonb, p_prices_required boolean) returns void
language plpgsql set search_path = public as $$
declare
  v_item jsonb;
  v_qty int;
  v_price numeric;
  v_product uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one item'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    v_price := round(nullif(v_item->>'price', '')::numeric, 2);
    v_product := nullif(v_item->>'product_id', '')::uuid;
    if v_qty is null or v_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
    if v_price is null and p_prices_required then raise exception 'Every item needs a price'; end if;
    if v_price is not null and v_price <= 0 then raise exception 'Price must be above 0'; end if;
    if v_product is null then
      if nullif(trim(v_item->>'name'), '') is null then raise exception 'Give each extra charge a description'; end if;
    elsif not exists (select 1 from products where id = v_product and is_active) then
      raise exception 'A product in this order is no longer available';
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_items) e where nullif(e->>'product_id', '') is not null)
     <> (select count(distinct e->>'product_id') from jsonb_array_elements(p_items) e where nullif(e->>'product_id', '') is not null) then
    raise exception 'The same product is listed twice. Put it on one line with the full quantity';
  end if;
end;
$$;

-- 5. SAVE A PENDING ORDER (new, or update one) -------------------------------------------------
-- Stock for its products is held: taken out of stock now, as far as there is stock.
create or replace function save_pending_order(
  p_customer_id uuid, p_items jsonb, p_notes text default null, p_pending_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_owner uuid;
  v_item jsonb;
  v_product uuid;
  v_qty int;
  v_old int;
  v_stock int;
  v_take int;
  v_change int;
  v_new_id uuid;
  v_keep uuid[] := '{}';
  v_pos int := 0;
  v_customer text;
  v_sales_name text;
  v_missing int;
  r record;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'Customer not found'; end if;
  perform check_order_lines(p_items, false);

  if p_pending_id is not null then
    select salesperson_id into v_owner from pending_orders where id = p_pending_id for update;
    if not found then raise exception 'This pending order was already finished or deleted'; end if;
    if v_owner <> auth.uid() and not is_admin() then
      raise exception 'Only the salesperson who saved this pending order or an admin can change it';
    end if;
    v_id := p_pending_id;
    update pending_orders set customer_id = p_customer_id, notes = nullif(trim(p_notes), ''),
      updated_at = now(), updated_by = auth.uid()
    where id = v_id;
  else
    insert into pending_orders (customer_id, salesperson_id, notes, updated_by)
    values (p_customer_id, auth.uid(), nullif(trim(p_notes), ''), auth.uid())
    returning id into v_id;
  end if;

  select name into v_customer from customers where id = p_customer_id;

  -- Lock every product involved (old and new lines) in the same (id) order, so nothing deadlocks
  perform 1 from products
  where id in (select product_id from pending_order_items where pending_id = v_id
               union select nullif(e->>'product_id', '')::uuid from jsonb_array_elements(p_items) e)
  order by id for update;

  delete from pending_order_items where pending_id = v_id and product_id is null;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_product := nullif(v_item->>'product_id', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_take := 0;

    if v_product is not null then
      -- Already held for this product by this pending order counts as available
      select coalesce(sum(held_qty), 0) into v_old from pending_order_items where pending_id = v_id and product_id = v_product;
      delete from pending_order_items where pending_id = v_id and product_id = v_product;
      select stock_qty into v_stock from products where id = v_product;
      v_take := least(v_stock + v_old, v_qty);
      v_change := v_take - v_old;
      if v_change <> 0 then
        perform set_move_pending(case when v_change > 0 then 'hold' else 'release' end, v_id,
          'Pending order for ' || v_customer);
        update products set stock_qty = stock_qty - v_change where id = v_product;
      end if;
    end if;

    insert into pending_order_items (pending_id, position, product_id, name, qty, price, held_qty)
    values (v_id, v_pos, v_product, case when v_product is null then trim(v_item->>'name') end, v_qty,
      round(nullif(v_item->>'price', '')::numeric, 2), v_take)
    returning id into v_new_id;
    v_keep := v_keep || v_new_id;
  end loop;

  -- Products taken off the pending order go back to stock
  for r in select id, product_id, held_qty from pending_order_items
           where pending_id = v_id and not (id = any(v_keep)) loop
    if r.held_qty > 0 then
      perform set_move_pending('release', v_id, 'Removed from pending order for ' || v_customer);
      update products set stock_qty = stock_qty + r.held_qty where id = r.product_id;
    end if;
    delete from pending_order_items where id = r.id;
  end loop;

  if p_pending_id is null then
    select full_name into v_sales_name from profiles where id = auth.uid();
    select count(*) into v_missing from pending_order_items where pending_id = v_id and price is null;
    insert into notifications (user_id, message, link)
    select id,
      v_sales_name || ' saved a pending order for ' || v_customer ||
        case when v_missing = 1 then ': 1 price needed'
             when v_missing > 1 then ': ' || v_missing || ' prices needed'
             else '' end,
      '/orders/new?pending=' || v_id
    from profiles where role = 'admin' and status = 'approved' and id <> auth.uid();
  end if;

  return v_id;
end;
$$;

-- 6. DELETE A PENDING ORDER: held stock goes back ------------------------------------------------
create or replace function delete_pending_order(p_pending_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_customer text;
  v_by text;
  r record;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select po.salesperson_id, c.name into v_owner, v_customer
  from pending_orders po join customers c on c.id = po.customer_id
  where po.id = p_pending_id for update of po;
  if not found then raise exception 'This pending order was already finished or deleted'; end if;
  if v_owner <> auth.uid() and not is_admin() then
    raise exception 'Only the salesperson who saved this pending order or an admin can delete it';
  end if;

  perform 1 from products where id in (select product_id from pending_order_items where pending_id = p_pending_id)
  order by id for update;

  for r in select product_id, held_qty from pending_order_items where pending_id = p_pending_id and held_qty > 0 loop
    perform set_move_pending('release', p_pending_id, 'Pending order for ' || v_customer || ' deleted');
    update products set stock_qty = stock_qty + r.held_qty where id = r.product_id;
  end loop;

  delete from pending_orders where id = p_pending_id;

  if v_owner <> auth.uid() then
    select full_name into v_by from profiles where id = auth.uid();
    insert into notifications (user_id, message, link)
    values (v_owner, v_by || ' deleted your pending order for ' || v_customer, '/orders');
  end if;
end;
$$;

-- 7. CREATE ORDER: extra charges, and finishing a pending order ------------------------------------
drop function if exists create_order(uuid, jsonb, text, numeric, text, date, boolean);

create or replace function create_order(
  p_customer_id uuid, p_items jsonb, p_notes text default null,
  p_amount_paid numeric default 0, p_method text default 'cash', p_due_date date default null,
  p_use_credit boolean default false, p_pending_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product uuid;
  v_stock int;
  v_held int;
  v_take int;
  v_change int;
  v_qty int;
  v_price numeric;
  v_total numeric := 0;
  v_prev numeric;
  v_from_credit numeric := 0;
  v_on_order numeric;
  v_extra numeric;
  v_left numeric := 0;
  v_receipt uuid;
  v_salesperson uuid := auth.uid();
  v_sales_name text;
  v_by text;
  v_customer text;
  v_invoice text;
  r record;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'Customer not found'; end if;
  perform check_order_lines(p_items, true);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total := v_total + (v_item->>'qty')::int * round((v_item->>'price')::numeric, 2);
  end loop;

  if p_amount_paid is null or p_amount_paid < 0 then raise exception 'Amount paid cannot be negative'; end if;

  -- Finishing a pending order: the order stays with the salesperson who started it
  if p_pending_id is not null then
    select salesperson_id into v_salesperson from pending_orders where id = p_pending_id for update;
    if not found then raise exception 'This pending order was already finished or deleted'; end if;
    if v_salesperson <> auth.uid() and not is_admin() then
      raise exception 'Only the salesperson who saved this pending order or an admin can finish it';
    end if;
  end if;

  -- Lock every product in this order in the same (id) order, so two orders at once never deadlock
  perform 1 from products
  where id in (select nullif(e->>'product_id', '')::uuid from jsonb_array_elements(p_items) e
               union select product_id from pending_order_items where pending_id = p_pending_id)
  order by id for update;

  v_prev := customer_owed(p_customer_id);

  insert into orders (customer_id, salesperson_id, notes, previous_balance, due_date)
  values (p_customer_id, v_salesperson, nullif(trim(p_notes), ''), v_prev, p_due_date)
  returning id, 'INV' || case when order_number < 1000 then lpad(order_number::text, 4, '0') else order_number::text end
  into v_order_id, v_invoice;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product := nullif(v_item->>'product_id', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_price := round((v_item->>'price')::numeric, 2);

    if v_product is null then
      insert into order_items (order_id, product_id, product_name, qty, price, pending_qty)
      values (v_order_id, null, trim(v_item->>'name'), v_qty, v_price, 0);
      continue;
    end if;

    -- Stock held for this product by the pending order is already out of stock
    select coalesce(sum(held_qty), 0) into v_held from pending_order_items
    where pending_id = p_pending_id and product_id = v_product;
    update pending_order_items set held_qty = 0 where pending_id = p_pending_id and product_id = v_product;

    select stock_qty into v_stock from products where id = v_product;
    v_take := least(v_stock + v_held, v_qty);
    v_change := v_take - v_held;
    if v_change > 0 then
      perform set_move('sale', v_order_id, null);
    elsif v_change < 0 then
      perform set_move('release', v_order_id, 'Held for the pending order but not needed');
    end if;
    if v_change <> 0 then
      update products set stock_qty = stock_qty - v_change where id = v_product;
    end if;

    insert into order_items (order_id, product_id, qty, price, pending_qty)
    values (v_order_id, v_product, v_qty, v_price, v_qty - v_take);
  end loop;

  if p_pending_id is not null then
    -- Products dropped while finishing go back to stock
    for r in select product_id, held_qty from pending_order_items where pending_id = p_pending_id and held_qty > 0 loop
      perform set_move('release', v_order_id, 'Removed when the pending order was finished');
      update products set stock_qty = stock_qty + r.held_qty where id = r.product_id;
    end loop;
    -- The stock held earlier for products on this invoice now belongs to it
    update stock_movements set order_id = v_order_id
    where pending_id = p_pending_id and order_id is null
      and product_id in (select product_id from order_items where order_id = v_order_id);
    delete from pending_orders where id = p_pending_id;
  end if;

  -- Credit the customer already has goes to this order first
  if p_use_credit then
    v_from_credit := allocate_credit(p_customer_id, v_order_id);
  end if;

  -- Then money received now: this order, then older debt, and anything left stays as credit
  v_on_order := least(p_amount_paid, v_total - v_from_credit);
  v_extra := p_amount_paid - v_on_order;

  if p_amount_paid > 0 then
    insert into receipts (customer_id, amount, method, created_by)
    values (p_customer_id, p_amount_paid, p_method, auth.uid())
    returning id into v_receipt;

    if v_on_order > 0 then
      insert into payments (order_id, amount, method, recorded_by, receipt_id)
      values (v_order_id, v_on_order, p_method, auth.uid(), v_receipt);
    end if;

    if v_extra > 0 then
      v_left := pay_oldest_orders(v_receipt, p_customer_id, v_extra, p_method, 'Paid with a new order', v_order_id);
    end if;

    update receipts set balance_after = customer_owed(p_customer_id), credit_after = customer_credit_amount(p_customer_id)
    where id = v_receipt;
  end if;

  -- What is still owed on earlier invoices after this payment
  update orders set previous_balance = v_prev - (v_extra - v_left) where id = v_order_id;

  select full_name into v_sales_name from profiles where id = v_salesperson;
  select full_name into v_by from profiles where id = auth.uid();
  select name into v_customer from customers where id = p_customer_id;

  insert into notifications (user_id, message, order_id)
  select id,
    'New order by ' || v_sales_name || ' for ' || v_customer ||
      case when v_salesperson <> auth.uid() then ' (finished by ' || v_by || ')' else '' end ||
      case when v_on_order + v_from_credit < v_total
           then ' (balance GHS ' || (v_total - v_on_order - v_from_credit) || ')' else '' end,
    v_order_id
  from profiles where role = 'admin' and status = 'approved' and id <> auth.uid() and id <> v_salesperson;

  -- The salesperson hears when someone else finished their pending order
  if v_salesperson <> auth.uid() then
    insert into notifications (user_id, message, order_id)
    values (v_salesperson, v_by || ' finished your pending order for ' || v_customer || ': ' || v_invoice, v_order_id);
  end if;

  return v_order_id;
end;
$$;

-- 8. RETURNS: an extra charge taken off is never "put back in stock" -------------------------------
create or replace function return_items(
  p_order_id uuid, p_items jsonb, p_reason text default null,
  p_restock boolean default true, p_refund_method text default 'cash'
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_item order_items;
  v_qty int;
  v_owed int;
  v_back int;
  v_restock boolean;
  v_total numeric;
  v_paid numeric;
  v_refund numeric := 0;
  v_salesperson uuid;
  v_number bigint;
  v_by text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Choose at least one item to return'; end if;

  select salesperson_id, order_number into v_salesperson, v_number
  from orders where id = p_order_id and cancelled_at is null for update;
  if not found then raise exception 'Order not found or cancelled'; end if;

  perform 1 from products where id in (select product_id from order_items where order_id = p_order_id) order by id for update;
  perform set_move('return', p_order_id, nullif(trim(p_reason), ''));

  for r in select * from jsonb_array_elements(p_items) loop
    v_qty := (r->>'qty')::int;
    if v_qty is null or v_qty < 1 then raise exception 'Quantity must be at least 1'; end if;

    select * into v_item from order_items where id = (r->>'item_id')::uuid and order_id = p_order_id for update;
    if not found then raise exception 'Item not found on this order'; end if;
    if v_qty > v_item.qty then raise exception 'Only % of this item are on the order', v_item.qty; end if;

    v_owed := least(v_qty, v_item.pending_qty);
    v_back := v_qty - v_owed;
    v_restock := p_restock and v_back > 0 and v_item.product_id is not null;

    update order_items set qty = qty - v_qty, pending_qty = pending_qty - v_owed where id = v_item.id;

    if v_restock then
      update products set stock_qty = stock_qty + v_back where id = v_item.product_id;
    end if;

    insert into order_returns (order_id, item_id, owed_removed, returned, restocked, reason, created_by)
    values (p_order_id, v_item.id, v_owed, v_back, v_restock, nullif(trim(p_reason), ''), auth.uid());
  end loop;

  select total, paid into v_total, v_paid from order_totals where order_id = p_order_id;
  if v_paid - v_total > 0.005 then
    v_refund := v_paid - v_total;
    if not is_admin() then
      raise exception 'The customer has paid GHS % more than the new total, so that must be refunded. Ask an admin to do this return.', v_refund;
    end if;
    insert into refunds (order_id, amount, method, note, created_by)
    values (p_order_id, v_refund, p_refund_method, nullif(trim(p_reason), ''), auth.uid());
  end if;

  select full_name into v_by from profiles where id = auth.uid();
  insert into notifications (user_id, message, order_id)
  select id,
    'Return on INV' || case when v_number < 1000 then lpad(v_number::text, 4, '0') else v_number::text end ||
      ' by ' || v_by || coalesce(': ' || nullif(trim(p_reason), ''), '') ||
      case when v_refund > 0 then ' (refunded GHS ' || v_refund || ')' else '' end,
    p_order_id
  from profiles
  where status = 'approved' and id <> auth.uid() and (id = v_salesperson or role = 'admin');

  return v_refund;
end;
$$;
