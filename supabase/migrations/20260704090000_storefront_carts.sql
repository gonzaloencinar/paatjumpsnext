-- Recuperación de carritos del storefront (pre-checkout): visitantes
-- identificados por la cookie pj_contact (llegaron desde un enlace de email
-- del CRM o acaban de suscribirse) cuyos carritos aún no pisaron el checkout
-- de Shopify. Se guardan como filas origin='storefront' en checkouts con id
-- NEGATIVO (secuencia propia — los ids de Shopify son siempre positivos, no
-- hay colisión) y el MISMO motor de cart_recovery los procesa sin cambios.
-- Cuando el cliente sí llega al checkout, el webhook casa por cart_token,
-- migra la inscripción al checkout real y la fila local pasa a
-- 'reached_checkout'. Aplicada en remoto vía MCP el 2026-07-04.

create sequence public.storefront_cart_id_seq
  increment -1 start -1 minvalue -9223372036854775807 maxvalue -1;

alter table public.checkouts
  alter column id set default nextval('public.storefront_cart_id_seq'),
  add column origin text not null default 'shopify'
    check (origin in ('shopify', 'storefront'));

alter table public.checkouts drop constraint checkouts_status_check;
alter table public.checkouts add constraint checkouts_status_check
  check (status in ('abandoned', 'recovered', 'converted', 'reached_checkout'));

-- Un carrito local por cart_token (upsert del server action) + búsqueda del
-- matching del webhook por cart_token.
create unique index checkouts_storefront_cart_token_key
  on public.checkouts (cart_token)
  where origin = 'storefront';
create index checkouts_cart_token_idx on public.checkouts (cart_token);
