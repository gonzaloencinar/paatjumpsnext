-- Espejo de la migración aplicada vía MCP el 2026-07-06 (finance_partner_ledger).
-- Finanzas de socios (/admin/finance): ingresos/gastos manuales, gastos
-- recurrentes materializados por periodo y ajustes (% IRPF) para el cuadre
-- mensual entre Gonzalo y Patri. Las ventas de Shopify NO se copian aquí:
-- se leen de public.orders al calcular el mes.

create table if not exists public.finance_recurring (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'expense' check (type in ('income', 'expense')),
  concept text not null,
  amount numeric(10,2) not null check (amount > 0),
  partner text not null check (partner in ('gonzalo', 'patri')),
  frequency text not null default 'monthly'
    check (frequency in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly')),
  -- 1–28 para que exista en todos los meses
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  concept text not null,
  amount numeric(10,2) not null check (amount > 0),
  -- gasto: quién lo pagó; ingreso: quién lo cobró
  partner text not null check (partner in ('gonzalo', 'patri')),
  entry_date date not null default current_date,
  notes text,
  -- entradas generadas desde un recurrente: (recurring_id, period) únicos para
  -- que la materialización sea idempotente. Al borrar el recurrente las
  -- entradas pasadas se conservan como movimientos sueltos (set null).
  recurring_id uuid references public.finance_recurring(id) on delete set null,
  period text check (period ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_entries_recurring_period unique (recurring_id, period)
);

create index if not exists finance_entries_entry_date_idx
  on public.finance_entries (entry_date);

-- Fila única de configuración (id = true)
create table if not exists public.finance_settings (
  id boolean primary key default true check (id),
  irpf_pct numeric(5,2) not null default 15 check (irpf_pct >= 0 and irpf_pct <= 60),
  updated_at timestamptz not null default now()
);

insert into public.finance_settings (id) values (true)
on conflict (id) do nothing;

alter table public.finance_recurring enable row level security;
alter table public.finance_entries enable row level security;
alter table public.finance_settings enable row level security;

create policy "Admins manage finance_recurring" on public.finance_recurring
  for all using ((select is_admin())) with check ((select is_admin()));
create policy "Admins manage finance_entries" on public.finance_entries
  for all using ((select is_admin())) with check ((select is_admin()));
create policy "Admins manage finance_settings" on public.finance_settings
  for all using ((select is_admin())) with check ((select is_admin()));
