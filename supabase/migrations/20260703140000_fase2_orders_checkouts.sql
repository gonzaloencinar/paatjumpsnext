-- Fase 2: webhooks de Shopify (orders/checkouts) + recuperación de carrito
-- (plan §7.2, §8, §16.2). Campos derivados en contacts (los mantienen los
-- webhooks; base de los segmentos de 3b), salida por compra y pasos seed de
-- cart_recovery. Aplicada en remoto vía MCP el 2026-07-03.

-- Campos derivados para segmentar (lead/cliente/actividad — §16.2)
alter table public.contacts
  add column orders_count  int not null default 0,
  add column total_spent   numeric not null default 0,
  add column last_order_at timestamptz,
  add column last_open_at  timestamptz,
  add column last_click_at timestamptz,
  add column tags          text[] not null default '{}';

-- Salida por compra (§16.4): un pedido cancela las inscripciones activas de
-- estas automatizaciones (la urgencia de bienvenida y los recordatorios de
-- carrito sobran cuando ya han comprado).
update public.automations
set config = coalesce(config, '{}'::jsonb) || '{"cancel_on_order": true}'::jsonb
where key in ('welcome', 'cart_recovery');

-- Pasos seed de cart_recovery (sustituyen al viejo config.steps): 1 h y +23 h
-- después de abandonar. {{url_carrito}} → abandoned_checkout_url del checkout.
insert into public.automation_steps
  (automation_id, position, delay_minutes, subject, preheader, body_html, enabled)
select a.id, 1, 60,
  'Tu comba se ha quedado en el carrito',
  'Lo guardamos todo tal y como lo dejaste',
  '<h2>Tu carrito te espera</h2><p>Hola{{nombre}}, guardamos tu carrito tal y como lo dejaste. Cuando quieras, lo retomas en un clic:</p><p><a href="{{url_carrito}}">Terminar mi compra</a></p><p>Si algo no te cuadraba (colores, dudas de envío…), responde a este email y te echamos una mano.</p>',
  true
from public.automations a where a.key = 'cart_recovery';

insert into public.automation_steps
  (automation_id, position, delay_minutes, subject, preheader, body_html, enabled)
select a.id, 2, 1380,
  '¿Lo dejamos guardado{{nombre}}?',
  'Tu carrito sigue disponible, pero no para siempre',
  '<h2>Sigue ahí, de momento</h2><p>Tu carrito sigue guardado. Los colores más pedidos vuelan en cada tirada, así que si lo tienes claro, mejor no esperar:</p><p><a href="{{url_carrito}}">Recuperar mi carrito</a></p>',
  true
from public.automations a where a.key = 'cart_recovery';
