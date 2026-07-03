-- Promociones gestionadas desde el CRM y sincronizadas con Shopify (decisión 2026-07-02):
--  · type 'general': código compartido con duración definida (p.ej. lanzamiento);
--    `announce` activa la barra de anuncio en el storefront.
--  · type 'affiliate': código de afiliado con % de comisión sobre sus ventas
--    (atribución vía orders.discount_code); estado activa/inactiva.
-- Aplicada en remoto vía MCP el 2026-07-02.
create table public.promotions (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('general','affiliate')),
  name          text not null,
  code          text unique not null check (code = upper(code)),
  percentage    int not null default 20 check (percentage between 1 and 100),
  affiliate_name text,
  affiliate_commission_pct numeric check (affiliate_commission_pct >= 0 and affiliate_commission_pct <= 100),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,
  active        boolean not null default false,
  announce      boolean not null default false,
  shopify_discount_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index promotions_lookup_idx on public.promotions (type, active, announce);

create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;
create policy "Admins manage promotions" on public.promotions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, insert, update, delete on public.promotions to authenticated;
