-- Run after schema_update_9.sql.
-- Invoices keep the names they were issued with, numbered refund notes, salesperson cash net of refunds.

-- 1. INVOICES KEEP THE CUSTOMER AND PRODUCT DETAILS THEY WERE ISSUED WITH --------------
-- Renaming a product or editing a customer later no longer changes old invoices.
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists customer_phone text;
alter table orders add column if not exists customer_location text;
alter table order_items add column if not exists product_name text;

update orders o set customer_name = c.name, customer_phone = c.phone, customer_location = c.location
from customers c where c.id = o.customer_id and o.customer_name is null;

update order_items oi set product_name = p.name
from products p where p.id = oi.product_id and oi.product_name is null;

create or replace function snapshot_order_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select name, phone, location into new.customer_name, new.customer_phone, new.customer_location
  from customers where id = new.customer_id;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_customer on orders;
create trigger trg_snapshot_customer before insert on orders
for each row execute function snapshot_order_customer();

create or replace function snapshot_item_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select name into new.product_name from products where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_product on order_items;
create trigger trg_snapshot_product before insert on order_items
for each row execute function snapshot_item_product();

-- 2. REFUND NOTES ARE NUMBERED (RFN0001, ...) ------------------------------------------------
alter table refunds add column if not exists refund_number bigint generated always as identity;

-- 3. SALESPERSON "CASH I COLLECTED" IS NET OF THEIR REFUNDS ---------------------------------
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
        where recorded_by = v_me and paid_at >= date_trunc('month', now())), 0)
      - coalesce((select sum(amount) from refunds
        where created_by = v_me and created_at >= date_trunc('month', now())), 0),
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
