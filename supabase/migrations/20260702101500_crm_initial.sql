-- Paat Jumps CRM — esquema inicial (docs/crm-email-marketing-plan.md §5)
-- Aplicada en remoto vía MCP el 2026-07-02 (proyecto hlrstnhhlkfsyiopfgca).
-- Tablas + RLS admin-only (is_admin) + grants Data API + seeds.

-- ─────────────────────────── Contactos ───────────────────────────
create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null check (email = lower(email)),
  first_name    text,
  status        text not null default 'pending'
                check (status in ('pending','subscribed','unsubscribed','bounced','complained')),
  source        text,
  consent       boolean not null default false,
  consent_text  text,
  consent_at    timestamptz,
  consent_ip    text,
  shopify_customer_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index contacts_status_idx on public.contacts (status);
create index contacts_created_at_idx on public.contacts (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- Timeline event-sourced: el corazón del CRM
create table public.events (
  id          bigint generated always as identity primary key,
  contact_id  uuid references public.contacts(id) on delete cascade,
  type        text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index events_contact_created_idx on public.events (contact_id, created_at desc);
create index events_type_created_idx on public.events (type, created_at desc);

-- ──────────────────── Checkouts abandonados (Shopify) ────────────────────
create table public.checkouts (
  id                bigint primary key,
  token             text,
  cart_token        text,
  contact_id        uuid references public.contacts(id),
  email             text,
  currency          text,
  total_price       numeric,
  line_items        jsonb,
  recovery_url      text,
  buyer_accepts_marketing boolean,
  status            text not null default 'abandoned'
                    check (status in ('abandoned','recovered','converted')),
  abandoned_at      timestamptz,
  last_event_at     timestamptz,
  recovery_sent_at  timestamptz,
  created_at        timestamptz not null default now()
);
create index checkouts_status_abandoned_idx on public.checkouts (status, abandoned_at);
create index checkouts_contact_idx on public.checkouts (contact_id);
create index checkouts_token_idx on public.checkouts (token);

-- ──────────────────────────── Campañas y pedidos ────────────────────────────
create table public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  subject      text,
  body_html    text,
  segment      jsonb,
  status       text not null default 'draft'
               check (status in ('draft','scheduled','sending','sent')),
  scheduled_at timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index campaigns_status_idx on public.campaigns (status);

create table public.orders (
  id                bigint primary key,
  contact_id        uuid references public.contacts(id),
  email             text,
  checkout_token    text,
  cart_token        text,
  total_price       numeric,
  currency          text,
  discount_code     text,
  campaign_id       uuid references public.campaigns(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index orders_contact_idx on public.orders (contact_id);
create index orders_campaign_idx on public.orders (campaign_id);
create index orders_created_at_idx on public.orders (created_at desc);

-- ────────────────────── Códigos de descuento ──────────────────────
create table public.discount_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  contact_id          uuid references public.contacts(id),
  shopify_discount_id text,
  percentage          int not null default 20,
  expires_at          timestamptz,
  redeemed            boolean not null default false,
  created_at          timestamptz not null default now()
);
create index discount_codes_contact_idx on public.discount_codes (contact_id);
-- Asignación desde el pool pre-generado (§8): códigos aún sin contacto
create index discount_codes_unassigned_idx on public.discount_codes (created_at) where contact_id is null;

-- ──────────────────── Automatizaciones (flows) ────────────────────
create table public.automations (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  enabled     boolean not null default true,
  config      jsonb,
  created_at  timestamptz not null default now()
);

create table public.automation_enrollments (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid references public.automations(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete cascade,
  checkout_id    bigint references public.checkouts(id),
  step           int not null default 0,
  status         text not null default 'active'
                 check (status in ('active','completed','canceled')),
  next_run_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique nulls not distinct (automation_id, contact_id, checkout_id)
);
create index enrollments_due_idx on public.automation_enrollments (status, next_run_at);
create index enrollments_contact_idx on public.automation_enrollments (contact_id);
create index enrollments_checkout_idx on public.automation_enrollments (checkout_id);

-- ─────────────────────── Envíos y eventos de email ───────────────────────
create table public.email_sends (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid references public.contacts(id),
  campaign_id         uuid references public.campaigns(id),
  automation_id       uuid references public.automations(id),
  template            text,
  subject             text,
  provider_message_id text,
  status              text not null default 'queued'
                      check (status in ('queued','sent','delivered','bounced','complained','failed')),
  sent_at             timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index email_sends_contact_created_idx on public.email_sends (contact_id, created_at desc);
create index email_sends_campaign_idx on public.email_sends (campaign_id);
create index email_sends_automation_idx on public.email_sends (automation_id);
create index email_sends_provider_msg_idx on public.email_sends (provider_message_id);

-- Lista de supresión: se consulta ANTES de cada envío
create table public.suppressions (
  email       text primary key check (email = lower(email)),
  reason      text not null check (reason in ('unsubscribe','hard_bounce','complaint','manual')),
  created_at  timestamptz not null default now()
);

-- ─────────────────────── Admin allowlist + RLS ───────────────────────
create table public.admin_users (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- SECURITY INVOKER: se apoya en la policy de admin_users (cada uno ve solo su fila)
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

alter table public.admin_users enable row level security;
create policy "Own admin row" on public.admin_users
  for select to authenticated
  using (email = lower(coalesce((select auth.jwt() ->> 'email'), '')));

alter table public.contacts enable row level security;
create policy "Admins manage contacts" on public.contacts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.events enable row level security;
create policy "Admins manage events" on public.events
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.checkouts enable row level security;
create policy "Admins manage checkouts" on public.checkouts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.orders enable row level security;
create policy "Admins manage orders" on public.orders
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.discount_codes enable row level security;
create policy "Admins manage discount_codes" on public.discount_codes
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.campaigns enable row level security;
create policy "Admins manage campaigns" on public.campaigns
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.automations enable row level security;
create policy "Admins manage automations" on public.automations
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.automation_enrollments enable row level security;
create policy "Admins manage automation_enrollments" on public.automation_enrollments
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.email_sends enable row level security;
create policy "Admins manage email_sends" on public.email_sends
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.suppressions enable row level security;
create policy "Admins manage suppressions" on public.suppressions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ─────────────────────── Grants Data API ───────────────────────
-- Desde 2026-04 las tablas nuevas no se exponen automáticamente: grant explícito
-- a authenticated (el panel /admin); anon no tiene acceso (el backend usará service role).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
revoke all on all tables in schema public from anon;

-- ─────────────────────── Seeds ───────────────────────
insert into public.automations (key, name, enabled, config) values
  ('welcome', 'Bienvenida con código -20%', false,
   '{"template": "welcome"}'::jsonb),
  ('cart_recovery', 'Recuperación de carrito', false,
   '{"steps": [{"delay_minutes": 60, "template": "cart_recovery_1"}, {"delay_minutes": 1440, "template": "cart_recovery_2"}]}'::jsonb)
on conflict (key) do nothing;

insert into public.admin_users (email) values
  ('hey@gonzaloencinar.com'),
  ('hola@paatjumps.com')
on conflict (email) do nothing;
