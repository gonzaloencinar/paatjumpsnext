-- Espejo de la migración aplicada vía MCP el 2026-07-06
-- (shipping_provider_column). Proveedor del envío: packlink (por defecto) o
-- genei (respaldo cuando Packlink es caro). Misma tabla para que fases, KPIs
-- y finanzas no cambien.
alter table public.packlink_shipments
  add column if not exists provider text not null default 'packlink';

create index if not exists packlink_shipments_provider_idx
  on public.packlink_shipments (provider);
