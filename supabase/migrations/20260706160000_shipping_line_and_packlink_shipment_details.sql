-- Espejo de la migración aplicada vía MCP el 2026-07-06
-- (shipping_line_and_packlink_shipment_details). Gestión de envíos en
-- /admin/orders: opción de envío del checkout (estándar vs urgente 24h) en
-- orders y detalle operativo del envío Packlink (servicio, precio cotizado
-- sin/con IVA, recogida programada, entrega estimada).
alter table public.orders
  add column if not exists shipping_line_title text;

alter table public.packlink_shipments
  add column if not exists service_id text,
  add column if not exists price_base numeric(10,2),
  add column if not exists price_total numeric(10,2),
  add column if not exists collection_date date,
  add column if not exists collection_time text,
  add column if not exists estimated_delivery_date date,
  add column if not exists home_to_home boolean;

create index if not exists packlink_shipments_collection_idx
  on public.packlink_shipments (collection_date);
