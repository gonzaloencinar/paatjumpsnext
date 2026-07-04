-- Vincula cada email de la secuencia de recuperación con SU carrito (un
-- contacto puede tener varios checkouts a lo largo del tiempo): base del
-- seguimiento por carrito en /admin/carts. Aplicada en remoto vía MCP el
-- 2026-07-04.

alter table public.email_sends
  add column checkout_id bigint references public.checkouts (id) on delete set null;

create index email_sends_checkout_idx
  on public.email_sends (checkout_id)
  where checkout_id is not null;
