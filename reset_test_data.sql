-- Clears test sales data so the app starts fresh. Run once in the Supabase SQL Editor.
-- Keeps: user accounts, products, and stock received (stock_in).
-- Deletes: orders, pending orders, order items, payments, receipts, refunds, returns, customers, notifications, stock history and stock adjustments.
-- Stock levels are recalculated from stock received, and the stock history is rebuilt from it.

begin;

-- SAFETY LOCK: this deletes every order, payment and customer. It refuses to run once the app
-- looks like it holds real business data (more than 30 orders, or any order older than 30 days).
-- If you are completely sure, change 30 below to a bigger number, run it, then change it back.
do $$
begin
  if (select count(*) from orders) > 30
     or exists (select 1 from orders where created_at < now() - interval '30 days' and opening_amount = 0) then
    raise exception 'STOPPED: this looks like real data (over 30 orders or orders older than 30 days). Nothing was deleted.';
  end if;
end $$;

delete from payments;
delete from receipts;
delete from order_items;
delete from orders;
delete from pending_orders;
delete from customers;

update products p
set stock_qty = coalesce((select sum(s.qty) from stock_in s where s.product_id = p.id), 0);

-- Rebuild stock history from stock received (after the update above, which logs its own rows)
delete from stock_movements;
insert into stock_movements (product_id, change, balance_after, kind, note, created_by, created_at)
select s.product_id, s.qty,
  sum(s.qty) over (partition by s.product_id order by s.received_at, s.id),
  'received', s.supplier, s.created_by, s.received_at
from stock_in s;

delete from notifications;

-- Next invoice will be INV0001, receipt RCT0001 and refund note RFN0001
alter table orders alter column order_number restart with 1;
alter table receipts alter column receipt_number restart with 1;
alter table refunds alter column refund_number restart with 1;

commit;
