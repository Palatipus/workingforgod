-- Run after schema_update_8.sql.
-- Owed-stock alerts, returns and refunds, reversed receipts keep their details, stock_in records the real user.

-- 1. WHO RECEIVED STOCK IS SET BY THE DATABASE --------------------------------------
create or replace function set_stock_in_user() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists trg_stock_in_user on stock_in;
create trigger trg_stock_in_user before insert on stock_in
for each row execute function set_stock_in_user();

-- 2. STOCK OWED TO CUSTOMERS ---------------------------------------------------------
create or replace view product_owed with (security_invoker = true) as
select oi.product_id,
  sum(oi.pending_qty)::int as owed_qty,
  count(distinct o.customer_id)::int as customers_waiting
from order_items oi join orders o on o.id = oi.order_id
where oi.pending_qty > 0 and o.cancelled_at is null
group by oi.product_id;

-- When stock arrives for something customers are waiting for, tell admins and the salespeople involved
create or replace function apply_stock_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owed int;
  v_count int;
  v_names text;
  v_product text;
begin
  perform set_move('received', null, new.supplier);
  update products set stock_qty = stock_qty + new.qty where id = new.product_id;

  select sum(oi.pending_qty), count(distinct o.customer_id), string_agg(distinct c.name, ', ')
  into v_owed, v_count, v_names
  from order_items oi
  join orders o on o.id = oi.order_id
  join customers c on c.id = o.customer_id
  where oi.product_id = new.product_id and oi.pending_qty > 0 and o.cancelled_at is null;

  if v_owed > 0 then
    select name into v_product from products where id = new.product_id;
    insert into notifications (user_id, message, link)
    select p.id,
      new.qty || ' ' || v_product || ' received. ' || v_owed || ' owed to ' ||
        case when v_count = 1 then v_names else v_count || ' customers (' || left(v_names, 80) || ')' end ||
        '. Deliver them first.',
      '/inventory?product=' || new.product_id
    from profiles p
    where p.status = 'approved' and (
      p.role = 'admin' or p.id in (
        select o.salesperson_id from orders o join order_items oi on oi.order_id = o.id
        where oi.product_id = new.product_id and oi.pending_qty > 0 and o.cancelled_at is null));
  end if;

  return new;
end;
$$;

-- 3. RETURNS AND REFUNDS ----------------------------------------------------------------
-- A line can be returned down to 0 (kept for history)
alter table order_items drop constraint if exists order_items_qty_check;
alter table order_items add constraint order_items_qty_check check (qty >= 0);

alter table stock_movements drop constraint if exists stock_movements_kind_check;
alter table stock_movements add constraint stock_movements_kind_check
  check (kind in ('opening', 'received', 'sale', 'delivery', 'cancel', 'adjustment', 'return'));

create table if not exists order_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references order_items(id) on delete cascade,
  owed_removed int not null default 0,   -- still-owed units taken off the order (never delivered)
  returned int not null default 0,       -- delivered units handed back
  restocked boolean not null default false,
  reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table order_returns enable row level security;
drop policy if exists "read returns" on order_returns;
create policy "read returns" on order_returns for select to authenticated using (is_approved());

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'mobile_money', 'bank_transfer', 'other')),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table refunds enable row level security;
drop policy if exists "read refunds" on refunds;
create policy "read refunds" on refunds for select to authenticated using (is_approved());

-- Paid now means payments minus refunds
create or replace view order_totals with (security_invoker = true) as
select o.id as order_id, o.customer_id,
  case when o.cancelled_at is null then coalesce(i.total, 0) else 0 end as total,
  coalesce(p.paid, 0) - coalesce(r.refunded, 0) as paid,
  case when o.cancelled_at is null then coalesce(i.total, 0) else 0 end - (coalesce(p.paid, 0) - coalesce(r.refunded, 0)) as balance
from orders o
left join (select order_id, sum(qty * price) as total from order_items group by order_id) i on i.order_id = o.id
left join (select order_id, sum(amount) as paid from payments group by order_id) p on p.order_id = o.id
left join (select order_id, sum(amount) as refunded from refunds group by order_id) r on r.order_id = o.id;

-- p_items: [{"item_id": "...", "qty": 1}]. Still-owed units are removed first (no stock change);
-- anything beyond that is delivered goods coming back, put back into stock when p_restock is true.
-- If the order ends up paid more than its new total, the difference is refunded (admins only).
-- Returns the refunded amount.
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

  perform set_move('return', p_order_id, nullif(trim(p_reason), ''));

  for r in select * from jsonb_array_elements(p_items) loop
    v_qty := (r->>'qty')::int;
    if v_qty is null or v_qty < 1 then raise exception 'Quantity must be at least 1'; end if;

    select * into v_item from order_items where id = (r->>'item_id')::uuid and order_id = p_order_id for update;
    if not found then raise exception 'Item not found on this order'; end if;
    if v_qty > v_item.qty then raise exception 'Only % of this item are on the order', v_item.qty; end if;

    v_owed := least(v_qty, v_item.pending_qty);
    v_back := v_qty - v_owed;

    update order_items set qty = qty - v_qty, pending_qty = pending_qty - v_owed where id = v_item.id;

    if v_back > 0 and p_restock then
      update products set stock_qty = stock_qty + v_back where id = v_item.product_id;
    end if;

    insert into order_returns (order_id, item_id, owed_removed, returned, restocked, reason, created_by)
    values (p_order_id, v_item.id, v_owed, v_back, p_restock and v_back > 0, nullif(trim(p_reason), ''), auth.uid());
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

-- 4. REVERSED RECEIPTS KEEP WHAT THEY PAID ----------------------------------------------
alter table receipts add column if not exists reversed_lines jsonb;

create or replace function reverse_receipt(p_receipt_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only an admin can reverse payments'; end if;

  if exists (select 1 from payments p join refunds f on f.order_id = p.order_id where p.receipt_id = p_receipt_id) then
    raise exception 'An invoice on this receipt has had a refund, so the payment cannot be reversed';
  end if;

  update receipts set reversed_at = now(), reversed_by = auth.uid(),
    reversed_lines = (select jsonb_agg(jsonb_build_object('order_number', o.order_number, 'amount', p.amount) order by o.order_number)
                      from payments p join orders o on o.id = p.order_id where p.receipt_id = p_receipt_id)
  where id = p_receipt_id and reversed_at is null;
  if not found then raise exception 'Receipt not found or already reversed'; end if;

  delete from payments where receipt_id = p_receipt_id;
end;
$$;

-- 5. DASHBOARD: cash collected is net of refunds -----------------------------------------
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
    'cash_this_month', coalesce((select sum(amount) from payments where paid_at >= date_trunc('month', now())), 0)
      - coalesce((select sum(amount) from refunds where created_at >= date_trunc('month', now())), 0),
    'cash_last_month', coalesce((select sum(amount) from payments
        where paid_at >= date_trunc('month', now()) - interval '1 month' and paid_at < date_trunc('month', now())), 0)
      - coalesce((select sum(amount) from refunds
        where created_at >= date_trunc('month', now()) - interval '1 month' and created_at < date_trunc('month', now())), 0),
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

-- Realtime for refunds and returns so open screens update
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'refunds') then
    alter publication supabase_realtime add table refunds;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'order_returns') then
    alter publication supabase_realtime add table order_returns;
  end if;
end $$;
