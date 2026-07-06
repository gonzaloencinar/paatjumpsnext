-- Espejo de la migración aplicada vía MCP el 2026-07-06 (packlink_shipments).
-- Envíos de Packlink PRO sincronizados por /api/cron/packlink-sync
-- (lib/crm/packlink-sync.ts, GET /v1/shipments con PACKLINK_API_KEY).
-- El coste real alimenta el cierre de mes de /admin/finance (gasto de
-- Gonzalo). `raw` guarda el JSON íntegro: si Packlink usa otros nombres de
-- campo cuando lleguen envíos reales, se ajusta el extractor y ?full=1
-- re-extrae sin perder nada.
create table if not exists public.packlink_shipments (
  reference text primary key,
  custom_reference text,
  state text,
  carrier text,
  service text,
  cost numeric(10,2),
  currency text,
  shipment_date timestamptz,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index if not exists packlink_shipments_date_idx
  on public.packlink_shipments (shipment_date);

alter table public.packlink_shipments enable row level security;
create policy "Admins manage packlink_shipments" on public.packlink_shipments
  for all using ((select is_admin())) with check ((select is_admin()));
revoke all on public.packlink_shipments from anon;
