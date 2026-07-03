-- Campañas 2.0 · sub-fase 3a: motor de envío (plan §16.3).
-- Snapshot de destinatarios por campaña + estados paused/canceled + RPCs del
-- motor. Aplicada en remoto vía MCP el 2026-07-03.

-- Estados nuevos del ciclo de vida (pausar/cancelar) + preheader del email
alter table public.campaigns drop constraint campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft','scheduled','sending','sent','paused','canceled'));
alter table public.campaigns add column paused_at timestamptz;
alter table public.campaigns add column preheader text;

-- Snapshot de destinatarios: auditoría RGPD de a quién se envió, envío
-- re-entrante/reanudable por lotes y denominador exacto de las métricas.
create table public.campaign_recipients (
  id            bigint generated always as identity primary key,
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  email         text not null,
  first_name    text,
  status        text not null default 'pending'
                check (status in ('pending','sending','sent','skipped','failed')),
  claimed_at    timestamptz,
  email_send_id uuid references public.email_sends(id),
  created_at    timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index campaign_recipients_campaign_status_idx
  on public.campaign_recipients (campaign_id, status);

alter table public.campaign_recipients enable row level security;
create policy "Admins manage campaign_recipients" on public.campaign_recipients
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.campaign_recipients to authenticated;

-- Materializa el segmento de la campaña (v1: todos los suscritos) cruzando
-- suppressions. Idempotente: on conflict do nothing → re-ejecutar no duplica.
-- SECURITY INVOKER: desde el panel manda la RLS is_admin; el cron usa service role.
create or replace function public.materialize_campaign(p_campaign_id uuid)
returns int
language sql
set search_path = ''
as $$
  with inserted as (
    insert into public.campaign_recipients (campaign_id, contact_id, email, first_name)
    select p_campaign_id, c.id, c.email, c.first_name
    from public.contacts c
    where c.status = 'subscribed'
      and not exists (select 1 from public.suppressions s where s.email = c.email)
    on conflict (campaign_id, contact_id) do nothing
    returning 1
  )
  select coalesce(count(*), 0)::int from inserted;
$$;

-- Recuento del segmento v1 (para el diálogo de confirmación del panel).
create or replace function public.count_campaign_audience()
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.contacts c
  where c.status = 'subscribed'
    and not exists (select 1 from public.suppressions s where s.email = c.email);
$$;

-- Reclama un lote de destinatarios de forma atómica (skip locked): dos ticks
-- solapados del cron no se pisan. Rescata filas 'sending' colgadas >15 min
-- (crash a mitad de tick): reenviar es seguro porque cada destinatario lleva
-- Idempotency-Key determinista en Resend.
create or replace function public.claim_campaign_batch(p_campaign_id uuid, p_limit int)
returns setof public.campaign_recipients
language sql
set search_path = ''
as $$
  update public.campaign_recipients r
  set status = 'sending', claimed_at = now()
  where r.id in (
    select id from public.campaign_recipients
    where campaign_id = p_campaign_id
      and (status = 'pending'
           or (status = 'sending' and claimed_at < now() - interval '15 minutes'))
    order by id
    limit p_limit
    for update skip locked
  )
  returning r.*;
$$;

-- Permisos de las RPCs: el panel (authenticated, con RLS detrás) puede
-- materializar y contar; reclamar lotes es solo del motor (service role).
revoke execute on function public.materialize_campaign(uuid) from public, anon;
revoke execute on function public.count_campaign_audience() from public, anon;
revoke execute on function public.claim_campaign_batch(uuid, int) from public, anon, authenticated;
grant execute on function public.materialize_campaign(uuid) to authenticated, service_role;
grant execute on function public.count_campaign_audience() to authenticated, service_role;
grant execute on function public.claim_campaign_batch(uuid, int) to service_role;
