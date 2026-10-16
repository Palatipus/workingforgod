-- Run after schema_update_11.sql.
-- Indexes, opening balances, customer credit (deposits), no deadlocks between orders,
-- editable names, clearer cancel message, cash figures from receipts.

-- 1. INDEXES (keep lists and totals fast as data grows) ---------------------------------
create index if not exists orders_customer_idx on orders (customer_id, created_at);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_salesperson_idx on orders (salesperson_id, created_at);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_product_idx on order_items (product_id);
create index if not exists order_items_owed_idx on order_items (product_id) where pending_qty > 0;
create index if not exists payments_order_idx on payments (order_id);
create index if not exists payments_receipt_idx on payments (receipt_id);
create index if not exists receipts_customer_idx on receipts (customer_id, created_at);
create index if not exists receipts_created_idx on receipts (created_at);
create index if not exists refunds_order_idx on refunds (order_id);
create index if not exists refunds_created_idx on refunds (created_at);
create index if not exists order_returns_order_idx on order_returns (order_id);
create index if not exists stock_in_product_idx on stock_in (product_id);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where not is_read;

-- 2. OPENING BALANCES ---------------------------------------------------------------------
-- Debt from before the app is an "order" with no items and an opening amount.
alter table orders add column if not exists opening_amount numeric(12,2) not null default 0;
alter table orders drop constraint if exists orders_opening_amount_check;
alter table orders add constraint orders_opening_amount_check check (opening_amount >= 0);

create or replace view order_totals with (security_invoker = true) as
select o.id as order_id, o.customer_id,
  case when o.cancelled_at is null then coalesce(i.total, 0) + o.opening_amount else 0 end as total,
  coalesce(p.paid, 0) - coalesce(r.refunded, 0) as paid,
  case when o.cancelled_at is null then coalesce(i.total, 0) + o.opening_amount else 0 end
    - (coalesce(p.paid, 0) - coalesce(r.refunded, 0)) as balance
from orders o
left join (select order_id, sum(qty * price) as total from order_items group by order_id) i on i.order_id = o.id
left join (select order_id, sum(amount) as paid from payments group by order_id) p on p.order_id = o.id
left join (select order_id, sum(amount) as refunded from refunds group by order_id) r on r.order_id = o.id;

create or replace view order_list with (security_invoker = true) as
select o.id, o.order_number,
  'INV' || case when o.order_number < 1000 then lpad(o.order_number::text, 4, '0') else o.order_number::text end as invoice_number,
  o.created_at, o.due_date, o.cancelled_at, o.customer_id,
  c.name as customer_name, pr.full_name as salesperson,
  t.total, t.paid, t.balance,
  exists (select 1 from order_items oi where oi.order_id = o.id and oi.pending_qty > 0) as has_pending,
  (o.cancelled_at is null and t.balance > 0 and o.due_date < current_date) as overdue,
  o.salesperson_id,
  (o.opening_amount > 0) as is_opening
from orders o
join customers c on c.id = o.customer_id
join profiles pr on pr.id = o.salesperson_id
join order_totals t on t.order_id = o.id;

create or replace function create_opening_balance(
  p_customer_id uuid, p_amount numeric, p_as_of date default null, p_note text default null, p_due_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_when timestamptz := coalesce(p_as_of::timestamptz, now());
begin
  if not is_admin() then raise exception 'Only an admin can enter opening balances'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount the customer owed'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'Customer not found'; end if;
  if v_when > now() then raise exception 'The date cannot be in the future'; end if;

  -- Dated in the past, so payments clear it before newer invoices
  insert into orders (customer_id, salesperson_id, notes, previous_balance, due_date, opening_amount, created_at)
  values (p_customer_id, auth.uid(), coalesce(nullif(trim(p_note), ''), 'Opening balance brought forward'), 0,
          p_due_date, round(p_amount, 2), v_when)
  returning id into v_id;
  return v_id;
end;
$$;

-- 3. CUSTOMER CREDIT (deposits and overpayments) -----------------------------------------
-- Money on a receipt that has not been applied to any invoice is the customer's credit.
alter table receipts add column if not exists credit_after numeric(12,2);

create or replace view customer_credit with (security_invoker = true) as
select r.customer_id, sum(r.amount - coalesce(a.used, 0)) as credit
from receipts r
left join (select receipt_id, sum(amount) as used from payments group by receipt_id) a on a.receipt_id = r.id
where r.reversed_at is null
group by r.customer_id;

create or replace function customer_credit_amount(p_customer uuid) returns numeric
language sql stable set search_path = public as $$
  select coalesce((select credit from customer_credit where customer_id = p_customer), 0);
$$;

create or replace view customer_balances with (security_invoker = true) as
select c.id as customer_id, c.name, c.phone, c.location,
  count(o.id) filter (where o.cancelled_at is null) as orders,
  coalesce(sum(t.total), 0) as total,
  coalesce(sum(t.paid), 0) as paid,
  coalesce(sum(t.balance), 0) as owed,
  coalesce(sum(t.balance) filter (where o.due_date < current_date and t.balance > 0), 0) as overdue,
  c.email,
  coalesce((select cc.credit from customer_credit cc where cc.customer_id = c.id), 0) as credit
from customers c
left join orders o on o.customer_id = c.id
left join order_totals t on t.order_id = o.id
group by c.id;

-- Applies unused credit to unpaid invoices, oldest first (or to one invoice). Returns the amount applied.
create or replace function allocate_credit(p_customer uuid, p_only_order uuid default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  o record;
  r record;
  v_left numeric;
  v_take numeric;
  v_applied numeric := 0;
begin
  for o in
    select t.order_id, t.balance
    from order_totals t join orders od on od.id = t.order_id
    where t.customer_id = p_customer and t.balance > 0 and od.cancelled_at is null
      and (p_only_order is null or t.order_id = p_only_order)
    order by od.created_at
  loop
    v_left := o.balance;
    for r in
      select rc.id, rc.method,
        rc.amount - coalesce((select sum(p.amount) from payments p where p.receipt_id = rc.id), 0) as free
      from receipts rc
      where rc.customer_id = p_customer and rc.reversed_at is null
      order by rc.created_at
    loop
      exit when v_left <= 0;
      continue when r.free <= 0;
      v_take := least(r.free, v_left);
      insert into payments (order_id, amount, method, note, recorded_by, receipt_id)
      values (o.order_id, v_take, r.method, 'From customer credit', auth.uid(), r.id);
      v_left := v_left - v_take;
      v_applied := v_applied + v_take;
    end loop;
  end loop;
  return v_applied;
end;
$$;
revoke execute on function allocate_credit(uuid, uuid) from public, anon, authenticated;

-- Staff button: use a customer's credit to pay what they owe
create or replace function apply_customer_credit(p_customer_id uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_applied numeric;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  v_applied := allocate_credit(p_customer_id);
  if v_applied <= 0 then raise exception 'There is no credit to use, or nothing is owed'; end if;
  return v_applied;
end;
$$;

-- Customer payment: clears oldest debts first; anything above what is owed stays as credit (a deposit)
create or replace function record_customer_payment(
  p_customer_id uuid, p_amount numeric, p_method text default 'cash', p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_receipt uuid;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be above 0'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'Customer not found'; end if;

  insert into receipts (customer_id, amount, method, note, created_by)
  values (p_customer_id, round(p_amount, 2), p_method, nullif(trim(p_note), ''), auth.uid())
  returning id into v_receipt;

  perform pay_oldest_orders(v_receipt, p_customer_id, round(p_amount, 2), p_method, nullif(trim(p_note), ''));

  update receipts set balance_after = customer_owed(p_customer_id), credit_after = customer_credit_amount(p_customer_id)
  where id = v_receipt;
  return v_receipt;
end;
$$;

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

  update receipts set balance_after = customer_owed(v_customer), credit_after = customer_credit_amount(v_customer)
  where id = v_receipt;
  return v_receipt;
end;
$$;

-- 4. CREATE ORDER: use credit, keep extra money as credit, lock products in a fixed order ----------
drop function if exists create_order(uuid, jsonb, text, numeric, text, date);

create or replace function create_order(
  p_customer_id uuid, p_items jsonb, p_notes text default null,
  p_amount_paid numeric default 0, p_method text default 'cash', p_due_date date default null,
  p_use_credit boolean default false
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
  v_from_credit numeric := 0;
  v_on_order numeric;
  v_extra numeric;
  v_left numeric := 0;
  v_receipt uuid;
  v_sales_name text;
  v_customer text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one item'; end if;
  if not exists (select 1 from customers where id = p_customer_id) then raise exception 'Customer not found'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    v_price := round((v_item->>'price')::numeric, 2);
    if v_qty is null or v_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
    if v_price is null or v_price <= 0 then raise exception 'Price must be above 0'; end if;
    if not exists (select 1 from products where id = (v_item->>'product_id')::uuid and is_active) then
      raise exception 'A product in this order is no longer available';
    end if;
    v_total := v_total + v_qty * v_price;
  end loop;

  if p_amount_paid is null or p_amount_paid < 0 then raise exception 'Amount paid cannot be negative'; end if;

  -- Lock every product in this order in the same (id) order, so two orders at once never deadlock
  perform 1 from products
  where id in (select (e->>'product_id')::uuid from jsonb_array_elements(p_items) e)
  order by id for update;

  v_prev := customer_owed(p_customer_id);

  insert into orders (customer_id, salesperson_id, notes, previous_balance, due_date)
  values (p_customer_id, auth.uid(), nullif(trim(p_notes), ''), v_prev, p_due_date)
  returning id into v_order_id;

  perform set_move('sale', v_order_id, null);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    select stock_qty into v_stock from products where id = (v_item->>'product_id')::uuid;
    v_take := least(v_stock, v_qty);
    if v_take > 0 then
      update products set stock_qty = stock_qty - v_take where id = (v_item->>'product_id')::uuid;
    end if;
    insert into order_items (order_id, product_id, qty, price, pending_qty)
    values (v_order_id, (v_item->>'product_id')::uuid, v_qty, round((v_item->>'price')::numeric, 2), v_qty - v_take);
  end loop;

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

  select full_name into v_sales_name from profiles where id = auth.uid();
  select name into v_customer from customers where id = p_customer_id;

  insert into notifications (user_id, message, order_id)
  select id,
    'New order by ' || v_sales_name || ' for ' || v_customer ||
      case when v_on_order + v_from_credit < v_total
           then ' (balance GHS ' || (v_total - v_on_order - v_from_credit) || ')' else '' end,
    v_order_id
  from profiles where role = 'admin' and status = 'approved' and id <> auth.uid();

  return v_order_id;
end;
$$;

-- 5. CANCEL AND RETURN ALSO LOCK PRODUCTS IN A FIXED ORDER; CLEARER CANCEL MESSAGE -------------
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

  if exists (select 1 from refunds where order_id = p_order_id) then
    raise exception 'This order has had a refund, so it cannot be cancelled. Use "Return items" to take everything off it instead';
  end if;
  if exists (select 1 from payments where order_id = p_order_id) then
    raise exception 'This order has payments. An admin must reverse them before it can be cancelled';
  end if;

  perform 1 from products where id in (select product_id from order_items where order_id = p_order_id) order by id for update;

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

-- 6. NAMES CAN BE CORRECTED -----------------------------------------------------------------
create or replace function set_my_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(p_name)) > 80 then
    raise exception 'Name must be 2-80 characters';
  end if;
  update profiles set full_name = trim(p_name) where id = auth.uid();
end;
$$;

create or replace function set_user_name(p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(p_name)) > 80 then
    raise exception 'Name must be 2-80 characters';
  end if;
  update profiles set full_name = trim(p_name) where id = p_user;
end;
$$;

-- 7. CASH FIGURES COME FROM RECEIPTS (money actually received, including deposits) ---------------
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
    'cash_this_month', coalesce((select sum(amount) from receipts
        where reversed_at is null and created_at >= date_trunc('month', now())), 0)
      - coalesce((select sum(amount) from refunds where created_at >= date_trunc('month', now())), 0),
    'cash_last_month', coalesce((select sum(amount) from receipts where reversed_at is null
        and created_at >= date_trunc('month', now()) - interval '1 month' and created_at < date_trunc('month', now())), 0)
      - coalesce((select sum(amount) from refunds
        where created_at >= date_trunc('month', now()) - interval '1 month' and created_at < date_trunc('month', now())), 0),
    'orders_this_month', (select count(*) from orders
        where cancelled_at is null and opening_amount = 0 and created_at >= date_trunc('month', now())),
    'pending_deliveries', (select count(*) from order_items where pending_qty > 0),
    'low_stock_count', (select count(*) from products
        where is_active and stock_qty > 0 and stock_qty <= reorder_level),
    'out_of_stock_count', (select count(*) from products where is_active and stock_qty = 0),
    'total_products', (select count(*) from products where is_active),
    'pending_signups', (select count(*) from profiles where status = 'pending'),
    'outstanding_debt', coalesce((select sum(balance) from order_totals where balance > 0), 0),
    'customers_owing', (select count(distinct customer_id) from order_totals where balance > 0),
    'overdue_amount', coalesce((select sum(t.balance) from order_totals t join orders o on o.id = t.order_id
        where t.balance > 0 and o.due_date < current_date), 0),
    'customer_credit', coalesce((select sum(credit) from customer_credit where credit > 0), 0)
  ) into v_result;

  return v_result;
end;
$$;

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
        where salesperson_id = v_me and cancelled_at is null and opening_amount = 0 and created_at >= date_trunc('month', now())),
    'cash_this_month', coalesce((select sum(amount) from receipts
        where created_by = v_me and reversed_at is null and created_at >= date_trunc('month', now())), 0)
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
