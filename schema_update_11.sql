-- Run after schema_update_10.sql. Company details (used on invoices, receipts and statements) editable by admins.

create table if not exists company_settings (
  id int primary key default 1 check (id = 1),   -- always exactly one row
  data jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table company_settings enable row level security;

drop policy if exists "read settings" on company_settings;
create policy "read settings" on company_settings for select to authenticated using (is_approved());

drop policy if exists "admins edit settings" on company_settings;
create policy "admins edit settings" on company_settings for update to authenticated
  using (is_admin()) with check (is_admin());

-- Record who changed the details
create or replace function stamp_settings() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_settings on company_settings;
create trigger trg_stamp_settings before update on company_settings
for each row execute function stamp_settings();

-- Start with the details that were built into the app
insert into company_settings (id, data) values (1, $json${
  "name": "WORKING FOR GOD VENTURES",
  "tagline": "Mindray specialists  |  Lab equipment, reagents and training",
  "phone": "0549576787",
  "whatsapp": "0549576787",
  "email": "oseigyamfikelvinkwaku@gmail.com",
  "address": [
    "Behind Roman Catholic Church, Bantama.",
    "Adjacent Atwima Kwawoma Rural Bank Ltd",
    "Closer to Race Course"
  ],
  "bank": {
    "name": "CAL BANK",
    "account": "1400004948868",
    "merchantNo": "0598591194",
    "accountName": "WORKING FOR GOD VENTURES"
  },
  "terms": [
    "Payment shall be made in accordance with the agreed terms. Cash customers are required to pay immediately unless otherwise agreed in writing. For credit customers, payment is due on or before the agreed due date.",
    "Customers are requested to inspect all goods upon delivery. Any shortages, damages or discrepancies should be reported within 12 hours of receipt.",
    "Please quote the invoice number in all payments and correspondence relating to this transaction. This invoice serves as evidence of the transaction and should be retained for your records.",
    "When mobile money, bank transfer or any other payment is made, please send a screenshot or take a picture of the slip and send it to this WhatsApp number 0549576787."
  ]
}$json$)
on conflict (id) do nothing;
