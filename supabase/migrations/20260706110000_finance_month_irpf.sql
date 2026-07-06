-- Espejo de la migración aplicada vía MCP el 2026-07-06 (finance_month_irpf).
-- Tipo de IRPF por mes (tipo marginal de Gonzalo, lo mete él a mano).
-- Efectivo del mes = fila de aquí si existe, si no el global de
-- finance_settings. Al cambiar el global, los meses ya pasados sin fila se
-- congelan con el valor antiguo (cierre de mes): el cambio solo afecta al mes
-- en curso y siguientes.
create table if not exists public.finance_month_irpf (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  irpf_pct numeric(5,2) not null check (irpf_pct >= 0 and irpf_pct <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_month_irpf enable row level security;
create policy "Admins manage finance_month_irpf" on public.finance_month_irpf
  for all using ((select is_admin())) with check ((select is_admin()));
revoke all on public.finance_month_irpf from anon;
