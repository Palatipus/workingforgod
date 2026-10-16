-- Run after schema_update_14.sql.
-- Faster totals as orders grow, and live updates for deposits.

-- 1. TOTALS ARE WORKED OUT ONLY FOR THE ORDERS ASKED FOR ------------------------------------------
-- Before, every order's total, payments and refunds were added up on each request, even to show one
-- customer or one page of orders. Now each order looks up only its own rows (using the indexes from
-- schema_update_12.sql). Same columns and the same results as before.
create or replace view order_totals with (security_invoker = true) as
select o.id as order_id, o.customer_id,
  case when o.cancelled_at is null then coalesce(i.total, 0) + o.opening_amount else 0 end as total,
  coalesce(p.paid, 0) - coalesce(r.refunded, 0) as paid,
  case when o.cancelled_at is null then coalesce(i.total, 0) + o.opening_amount else 0 end
    - (coalesce(p.paid, 0) - coalesce(r.refunded, 0)) as balance
from orders o
left join lateral (select sum(qty * price) as total from order_items where order_id = o.id) i on true
left join lateral (select sum(amount) as paid from payments where order_id = o.id) p on true
left join lateral (select sum(amount) as refunded from refunds where order_id = o.id) r on true;

create or replace view customer_credit with (security_invoker = true) as
select r.customer_id,
  sum(r.amount - coalesce((select sum(p.amount) from payments p where p.receipt_id = r.id), 0)) as credit
from receipts r
where r.reversed_at is null
group by r.customer_id;

-- 2. LIVE UPDATES WHEN A DEPOSIT IS RECORDED OR REVERSED ---------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'receipts') then
    alter publication supabase_realtime add table receipts;
  end if;
end $$;
