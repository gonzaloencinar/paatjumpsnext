-- Campañas 2.0 · sub-fase 3c: secuencias (plan §16.4).
-- Pasos editables en DB, trigger por automatización, atribución por paso en
-- email_sends, re-inscripciones y RPC de claim para el runner del cron.
-- Aplicada en remoto vía MCP el 2026-07-03.

-- Trigger de cada automatización (signup y manual operativos desde 3c;
-- checkout_abandoned/order_placed/winback se procesan con la Fase 2).
alter table public.automations add column trigger text not null default 'signup'
  check (trigger in ('signup','checkout_abandoned','order_placed','winback','manual'));
update public.automations set trigger = 'checkout_abandoned' where key = 'cart_recovery';

-- Pasos de la secuencia: contenido editable sin deploy (mismo editor que
-- campañas). Un paso solo "cuenta" si enabled y con asunto+contenido.
create table public.automation_steps (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  position      int not null,
  delay_minutes int not null default 0 check (delay_minutes >= 0), -- desde el paso anterior (el 1º: desde el trigger)
  subject       text,
  preheader     text,
  body_html     text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);
create index automation_steps_automation_idx
  on public.automation_steps (automation_id, position);

alter table public.automation_steps enable row level security;
create policy "Admins manage automation_steps" on public.automation_steps
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.automation_steps to authenticated;

-- Métricas por paso (¿funciona mejor la reseña en D10 o D14?)
alter table public.email_sends
  add column automation_step_id uuid references public.automation_steps(id);

-- Re-inscripciones (§16.4): la unique total impedía volver a inscribir a un
-- contacto que ya completó/canceló una pasada. Parciales en su lugar:
--  · sin checkout: una única inscripción ACTIVA por automatización+contacto
--  · con checkout: una inscripción por checkout (histórico incluido)
alter table public.automation_enrollments
  drop constraint automation_enrollments_automation_id_contact_id_checkout_id_key;
create unique index enrollments_active_no_checkout_key
  on public.automation_enrollments (automation_id, contact_id)
  where (checkout_id is null and status = 'active');
create unique index enrollments_checkout_key
  on public.automation_enrollments (automation_id, contact_id, checkout_id)
  where (checkout_id is not null);

-- Reclama inscripciones vencidas con lease de 15 min (misma mecánica que las
-- campañas): dos ticks solapados no se pisan y un crash reintenta solo; el
-- reenvío es seguro por la Idempotency-Key por inscripción+paso.
create or replace function public.claim_due_enrollments(p_limit int)
returns setof public.automation_enrollments
language sql
set search_path = ''
as $$
  update public.automation_enrollments e
  set next_run_at = now() + interval '15 minutes'
  where e.id in (
    select ae.id
    from public.automation_enrollments ae
    join public.automations a on a.id = ae.automation_id
    where ae.status = 'active'
      and ae.next_run_at <= now()
      and a.enabled
    order by ae.next_run_at
    limit p_limit
    for update of ae skip locked
  )
  returning e.*;
$$;
revoke execute on function public.claim_due_enrollments(int) from public, anon, authenticated;
grant execute on function public.claim_due_enrollments(int) to service_role;

-- Serie de bienvenida de arranque (D3 y D6 tras el alta; el D0 con el código
-- lo envía /api/subscribe). La automatización sigue disabled hasta que el
-- dueño la encienda; el copy se edita en /admin/automations.
insert into public.automation_steps
  (automation_id, position, delay_minutes, subject, preheader, body_html, enabled)
select a.id, 1, 4320,
  '¿Ya sabes con cuál quedarte, {{nombre}}?',
  'Beaded o velocidad: elegir comba, sin líos',
  '<h2>Elegir comba, sin líos</h2><p>Hola{{nombre}}, va lo básico para decidir:</p><p><strong>Beaded (con cuentas):</strong> se oye cada vuelta, aguanta asfalto y es la reina del freestyle y del ritmo. Ideal para empezar y para dominar trucos.</p><p><strong>De velocidad:</strong> ligera y finísima, para dobles y cardio serio.</p><p><a href="https://www.paatjumps.com/search">Ver todas las combas</a></p>',
  true
from public.automations a where a.key = 'welcome';

insert into public.automation_steps
  (automation_id, position, delay_minutes, subject, preheader, body_html, enabled)
select a.id, 2, 4320,
  '{{nombre}}, tu descuento de bienvenida sigue ahí',
  'El código de tu primer email se aplica solo desde el botón',
  '<h2>No lo dejes escapar</h2><p>Hola{{nombre}}, tu descuento de bienvenida sigue activo, pero la promo de lanzamiento no dura para siempre.</p><p>Recupera el email que te enviamos al suscribirte: el botón aplica el código solo en tu carrito. Y si tienes cualquier duda para elegir, responde a este email y te ayudamos.</p><p><a href="https://www.paatjumps.com/search">Elegir mi comba</a></p>',
  true
from public.automations a where a.key = 'welcome';
