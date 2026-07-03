-- Espejo de la migración aplicada vía MCP el 2026-07-03 (versión remota
-- 20260703192429_shopify_sync_orders_customers_utm). Sync Shopify → CRM:
-- pedidos completos con atribución UTM, tabla customers y cursores de sync.

-- Pedidos: campos completos de Shopify + atribución UTM (first/last touch)
alter table public.orders
  add column if not exists name text,
  add column if not exists order_number bigint,
  add column if not exists customer_id bigint,
  add column if not exists processed_at timestamptz,
  add column if not exists financial_status text,
  add column if not exists fulfillment_status text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists test boolean not null default false,
  add column if not exists subtotal_price numeric,
  add column if not exists total_tax numeric,
  add column if not exists total_discounts numeric,
  add column if not exists total_shipping numeric,
  add column if not exists total_refunded numeric not null default 0,
  add column if not exists line_items jsonb,
  add column if not exists shipping_country text,
  add column if not exists shipping_country_code text,
  add column if not exists shipping_province text,
  add column if not exists shipping_city text,
  add column if not exists shipping_zip text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists landing_page text,
  add column if not exists referrer text,
  add column if not exists first_utm_source text,
  add column if not exists first_utm_medium text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_landing_page text,
  add column if not exists first_referrer text,
  add column if not exists gclid text,
  add column if not exists fbclid text,
  add column if not exists source_name text,
  add column if not exists shopify_landing_site text,
  add column if not exists shopify_referring_site text,
  add column if not exists synced_at timestamptz;

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_email_idx on public.orders (email);

-- Clientes de Shopify (sync por cron; distinto de contacts = CRM email)
create table if not exists public.customers (
  id bigint primary key,
  email text,
  first_name text,
  last_name text,
  phone text,
  city text,
  province text,
  province_code text,
  country text,
  country_code text,
  zip text,
  orders_count integer not null default 0,
  total_spent numeric not null default 0,
  currency text,
  accepts_email_marketing boolean,
  verified_email boolean,
  tags text[] not null default '{}',
  note text,
  shopify_created_at timestamptz,
  shopify_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create policy "Admins manage customers" on public.customers
  for all using ((select is_admin())) with check ((select is_admin()));
create index if not exists customers_email_idx on public.customers (email);
create index if not exists customers_total_spent_idx on public.customers (total_spent desc);

-- Cursores de sincronización incremental
create table if not exists public.sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.sync_state enable row level security;
create policy "Admins manage sync_state" on public.sync_state
  for all using ((select is_admin())) with check ((select is_admin()));
