-- Espejo de la migración aplicada vía MCP el 2026-07-06 (finance_month_close).
-- NOTA: retirada ese mismo día por 20260706140000_drop_finance_month_close —
-- el coste real de envíos pasó a llegar del sync de Packlink y el cierre
-- manual de mes dejó de existir. Se conserva el espejo porque la migración
-- figura en el historial remoto.
create table if not exists public.finance_month_close (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  shipping_cost numeric(10,2) not null default 0 check (shipping_cost >= 0),
  closed_at timestamptz not null default now()
);

alter table public.finance_month_close enable row level security;
create policy "Admins manage finance_month_close" on public.finance_month_close
  for all using ((select is_admin())) with check ((select is_admin()));
revoke all on public.finance_month_close from anon;
