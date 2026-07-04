-- (1) Paso 3 de cart_recovery (72 h del abandono = 48 h tras el paso 2): el
-- cierre con descuento. {{codigo_descuento}} → promo general activa o código
-- personal de un solo uso (15 %, caduca a las 48 h, usageLimit 1 en Shopify)
-- creado al vuelo por el motor. Solo se inserta si no existe ya un paso 3.
-- (2) Sin nombre en las comunicaciones (decisión 2026-07-04: muchas altas
-- llegan sin él): strip de {{nombre}} en los pasos existentes con la misma
-- limpieza de puntuación que mergeName. Aplicada en remoto vía MCP 2026-07-04.

insert into public.automation_steps
  (automation_id, position, delay_minutes, subject, preheader, body_html, enabled)
select a.id, 3, 2880,
  'Un descuento para estrenar tu comba',
  'Es solo para ti y tiene los días contados',
  '<h2>El último empujón</h2><p>Tu carrito sigue guardado y queremos que estrenes comba ya. Aquí va un descuento para terminarlo:</p><p style="text-align:center;font-size:22px;letter-spacing:3px;"><strong>{{codigo_descuento}}</strong></p><p><a href="{{url_carrito}}">Terminar mi compra con descuento</a></p><p>El botón lo aplica solo en tu carrito. El código es para ti y tiene los días contados — mejor hoy que mañana.</p>',
  true
from public.automations a
where a.key = 'cart_recovery'
  and not exists (
    select 1 from public.automation_steps s
    where s.automation_id = a.id and s.position = 3
  );

-- Caso especial primero: subject que ARRANCA con el tag (el strip genérico
-- dejaría una coma colgando al principio)
update public.automation_steps
set subject = 'Tu descuento de bienvenida sigue ahí'
where subject = '{{nombre}}, tu descuento de bienvenida sigue ahí';

update public.automation_steps set
  subject   = regexp_replace(regexp_replace(regexp_replace(replace(subject,   '{{nombre}}', ''), '[ \t]{2,}', ' ', 'g'), '[ \t]+([!?.,;:])', '\1', 'g'), '[,;:]+([!?.])', '\1', 'g'),
  preheader = regexp_replace(regexp_replace(regexp_replace(replace(preheader, '{{nombre}}', ''), '[ \t]{2,}', ' ', 'g'), '[ \t]+([!?.,;:])', '\1', 'g'), '[,;:]+([!?.])', '\1', 'g'),
  body_html = regexp_replace(regexp_replace(regexp_replace(replace(body_html, '{{nombre}}', ''), '[ \t]{2,}', ' ', 'g'), '[ \t]+([!?.,;:])', '\1', 'g'), '[,;:]+([!?.])', '\1', 'g')
where subject like '%{{nombre}}%'
   or preheader like '%{{nombre}}%'
   or body_html like '%{{nombre}}%';
