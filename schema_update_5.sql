-- Run after schema_update_4.sql. Tightens order checks, locks down mark_delivered, adds debt to the dashboard.

-- Only approved users can mark items delivered, and only items that are still owed
create or replace function mark_delivered(p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  update order_items set pending_qty = 0, delivered_at = now()
  where id = p_item_id and pending_qty > 0;
end;
$$;

-- create_order: same as schema_update_4 plus clear errors for empty orders, zero quantities and bad prices
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
  v_total numeric;
  v_prev numeric;
  v_sales_name text;
  v_customer text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one item'; end if;

  select coalesce(sum(balance), 0) into v_prev from order_totals where customer_id = p_customer_id;

  insert into orders (customer_id, salesperson_id, notes, previous_balance, due_date)
  values (p_customer_id, auth.uid(), p_notes, v_prev, p_due_date)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    v_price := (v_item->>'price')::numeric;
    if v_qty is null or v_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
    if v_price is null or v_price <= 0 then raise exception 'Price must be above 0'; end if;

    select stock_qty into v_stock from products
    where id = (v_item->>'product_id')::uuid for update;
    if v_stock is null then raise exception 'Product not found'; end if;

    v_take := least(v_stock, v_qty);

    update products set stock_qty = stock_qty - v_take
    where id = (v_item->>'product_id')::uuid;

    insert into order_items (order_id, product_id, qty, price, pending_qty)
    values (v_order_id, (v_item->>'product_id')::uuid, v_qty, v_price, v_qty - v_take);
  end loop;

  select coalesce(sum(qty * price), 0) into v_total from order_items where order_id = v_order_id;

  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > v_total then
    raise exception 'Amount paid must be between 0 and the order total';
  end if;

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

-- Dashboard: add total outstanding customer debt
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
    'pending_signups', (select count(*) from profiles where status = 'pending'),
    'outstanding_debt', coalesce((select sum(balance) from order_totals where balance > 0), 0),
    'customers_owing', (select count(distinct customer_id) from order_totals where balance > 0)
  ) into v_result;

  return v_result;
end;
$$;
