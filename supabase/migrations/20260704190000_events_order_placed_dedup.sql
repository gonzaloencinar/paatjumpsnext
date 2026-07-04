-- Dedup de eventos order_placed (timeline del contacto).
-- orders/create y orders/updated comparten handler; el chequeo previo con
-- maybeSingle() se rompía en cuanto había 2 filas (error → insertaba otra) y
-- cada update del pedido sumaba un evento más. El índice único parcial hace el
-- dedup a prueba de carreras: el webhook ahora inserta y deja que el 23505
-- descarte los repetidos.
-- Aplicada en remoto vía MCP el 2026-07-04 (proyecto hlrstnhhlkfsyiopfgca).

-- Limpieza: conservar el evento más antiguo por (contacto, pedido)
delete from public.events e
using public.events k
where e.type = 'order_placed'
  and k.type = 'order_placed'
  and k.contact_id = e.contact_id
  and k.payload->>'order_id' = e.payload->>'order_id'
  and k.id < e.id;

create unique index events_order_placed_unique
  on public.events (contact_id, (payload->>'order_id'))
  where type = 'order_placed';
