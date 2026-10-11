-- Working For God Ventures: inventory + sales schema (Supabase / Postgres)
-- Run in the Supabase SQL editor.

-- USERS ---------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role text not null default 'salesperson' check (role in ('admin', 'salesperson')),
  created_at timestamptz default now()
);

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- PRODUCTS (no price: price is set per order) -------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('equipment', 'reagent', 'consumable')),
  brand text,
  description text,
  image_url text,
  stock_qty int not null default 0 check (stock_qty >= 0),
  reorder_level int not null default 5,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  location text,
  created_at timestamptz default now()
);

-- ORDERS --------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  customer_id uuid not null references customers(id),
  salesperson_id uuid not null references profiles(id),
  notes text,
  created_at timestamptz default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  qty int not null check (qty > 0),
  price numeric(12,2) not null check (price >= 0),
  pending_qty int not null default 0 check (pending_qty >= 0), -- > 0 means show red
  delivered_at timestamptz
);

create table stock_in (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  qty int not null check (qty > 0),
  supplier text,
  received_at date not null default current_date,
  created_by uuid references profiles(id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  order_id uuid references orders(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz default now()
);

-- STOCK IN adds to product stock -------------------------------------
create or replace function apply_stock_in() returns trigger
language plpgsql as $$
begin
  update products set stock_qty = stock_qty + new.qty where id = new.product_id;
  return new;
end;
$$;

create trigger trg_stock_in after insert on stock_in
for each row execute function apply_stock_in();

-- CREATE ORDER (one transaction) -------------------------------------
-- p_items example: [{"product_id": "...", "qty": 5, "price": 120.50}]
-- If qty > stock: stock goes to 0 and the rest is saved as pending_qty.
create or replace function create_order(p_customer_id uuid, p_items jsonb, p_notes text default null)
returns uuid
language plpgsql security definer as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_stock int;
  v_take int;
  v_qty int;
  v_name text;
  v_sales_name text;
  v_customer text;
begin
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

  insert into notifications (user_id, message, order_id)
  select id, 'New order by ' || v_sales_name || ' for ' || v_customer, v_order_id
  from profiles where role = 'admin';

  return v_order_id;
end;
$$;

-- MARK PENDING ITEM DELIVERED (does not touch stock) -----------------
create or replace function mark_delivered(p_item_id uuid) returns void
language sql security definer as $$
  update order_items set pending_qty = 0, delivered_at = now() where id = p_item_id;
$$;

-- ROW LEVEL SECURITY --------------------------------------------------
alter table profiles enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table stock_in enable row level security;
alter table notifications enable row level security;

create policy "read all" on profiles for select to authenticated using (true);
create policy "read all" on products for select to authenticated using (true);
create policy "read all" on customers for select to authenticated using (true);
create policy "read all" on orders for select to authenticated using (true);
create policy "read all" on order_items for select to authenticated using (true);
create policy "read all" on stock_in for select to authenticated using (true);

create policy "admin manages products" on products for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "admin records stock in" on stock_in for insert to authenticated
  with check (is_admin());
create policy "staff add customers" on customers for insert to authenticated
  with check (true);
create policy "own notifications" on notifications for select to authenticated
  using (user_id = auth.uid());
create policy "mark own read" on notifications for update to authenticated
  using (user_id = auth.uid());

-- PRODUCT PHOTOS (public bucket, admin uploads) ----------------------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

create policy "public read photos" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "admin upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and is_admin());

-- Realtime so new orders and notifications show live
alter publication supabase_realtime add table orders, order_items, notifications;
