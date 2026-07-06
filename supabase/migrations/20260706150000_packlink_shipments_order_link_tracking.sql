-- Espejo de la migración aplicada vía MCP el 2026-07-06
-- (packlink_shipments_order_link_tracking). Enlaza los envíos Packlink con
-- pedidos de /admin/orders y guarda tracking + etiqueta extraídos del raw.
-- `fulfillment_synced_at` marca que el fulfillment ya se creó en Shopify
-- (lib/crm/packlink-sync.ts) para no duplicarlo.
alter table public.packlink_shipments
  add column if not exists order_id bigint,
  add column if not exists tracking text,
  add column if not exists tracking_url text,
  add column if not exists label_url text,
  add column if not exists fulfillment_synced_at timestamptz;

create index if not exists packlink_shipments_order_idx
  on public.packlink_shipments (order_id);
create index if not exists packlink_shipments_custom_ref_idx
  on public.packlink_shipments (custom_reference);
