-- Espejo de la migración aplicada vía MCP el 2026-07-06 (order_dni_requests).
-- Petición de DNI/NIE post-pedido para destinos con aduana (Canarias, Ceuta,
-- Melilla → email ES) o internacionales (→ email EN). El cliente lo envía
-- desde un formulario propio (/id/<token firmado>); recordatorio a las 24 h y
-- aviso a contacto@paatjumps.com a las 48 h sin respuesta.
create table if not exists public.order_dni_requests (
  order_id bigint primary key,
  order_name text,
  email text not null,
  locale text not null default 'es' check (locale in ('es', 'en')),
  dni text,
  submitted_at timestamptz,
  first_sent_at timestamptz,
  reminder_sent_at timestamptz,
  alerted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.order_dni_requests enable row level security;

-- Solo el panel admin lee/escribe con la sesión; el formulario público y el
-- cron usan la service key (bypass RLS) tras verificar el token firmado.
create policy "admin all" on public.order_dni_requests
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists order_dni_requests_pending_idx
  on public.order_dni_requests (created_at)
  where submitted_at is null;
