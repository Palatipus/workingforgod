-- Run after schema_update_3.sql. Adds part payments, customer debt and debt carried onto new invoices.

alter table orders add column previous_balance numeric(12,2) not null default 0;
alter table orders add column due_date date;

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'mobile_money', 'bank_transfer', 'other')),
  note text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references profiles(id)
);

alter table payments enable row level security;
create policy "read payments" on payments for select to authenticated using (is_approved());

-- Total, paid and balance for every order
create or replace view order_totals with (security_invoker = true) as
select o.id as order_id, o.customer_id,
  coalesce(i.total, 0) as total,
  coalesce(p.paid, 0) as paid,
  coalesce(i.total, 0) - coalesce(p.paid, 0) as balance
from orders o
left join (select order_id, sum(qty * price) as total from order_items group by order_id) i on i.order_id = o.id
left join (select order_id, sum(amount) as paid from payments group by order_id) p on p.order_id = o.id;

-- How much every customer owes
create or replace view customer_balances with (security_invoker = true) as
select c.id as customer_id, c.name, c.phone, c.location,
  count(t.order_id) as orders,
  coalesce(sum(t.total), 0) as total,
  coalesce(sum(t.paid), 0) as paid,
  coalesce(sum(t.balance), 0) as owed
from customers c
left join order_totals t on t.customer_id = c.id
group by c.id;

-- New create_order: records the payment made at checkout and saves the customer's previous debt on the order
drop function if exists create_order(uuid, jsonb, text);

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
  v_total numeric;
  v_prev numeric;
  v_sales_name text;
  v_customer text;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select coalesce(sum(balance), 0) into v_prev from order_totals where customer_id = p_customer_id;

  insert into orders (customer_id, salesperson_id, notes, previous_balance, due_date)
  values (p_customer_id, auth.uid(), p_notes, v_prev, p_due_date)
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

  select coalesce(sum(qty * price), 0) into v_total from order_items where order_id = v_order_id;

  if p_amount_paid < 0 or p_amount_paid > v_total then
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

-- Record a payment against one order
create or replace function record_order_payment(
  p_order_id uuid, p_amount numeric, p_method text default 'cash', p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select balance into v_balance from order_totals where order_id = p_order_id;
  if v_balance is null then raise exception 'Order not found'; end if;
  if p_amount <= 0 or p_amount > v_balance then
    raise exception 'Amount must be above 0 and at most the balance of %', v_balance;
  end if;

  insert into payments (order_id, amount, method, note, recorded_by)
  values (p_order_id, p_amount, p_method, p_note, auth.uid());
end;
$$;

-- Record a payment for a customer: it clears their oldest unpaid orders first
create or replace function record_customer_payment(
  p_customer_id uuid, p_amount numeric, p_method text default 'cash', p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owed numeric;
  v_left numeric := p_amount;
  v_take numeric;
  r record;
begin
  if not is_approved() then raise exception 'Account not approved'; end if;

  select coalesce(sum(balance), 0) into v_owed from order_totals where customer_id = p_customer_id;
  if p_amount <= 0 or p_amount > v_owed then
    raise exception 'Amount must be above 0 and at most the amount owed of %', v_owed;
  end if;

  for r in
    select t.order_id, t.balance
    from order_totals t join orders o on o.id = t.order_id
    where t.customer_id = p_customer_id and t.balance > 0
    order by o.created_at asc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.balance);
    insert into payments (order_id, amount, method, note, recorded_by)
    values (r.order_id, v_take, p_method, p_note, auth.uid());
    v_left := v_left - v_take;
  end loop;
end;
$$;

alter publication supabase_realtime add table payments;
