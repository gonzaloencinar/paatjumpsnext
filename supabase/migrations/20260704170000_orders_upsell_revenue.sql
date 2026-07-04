-- Revenue del upsell post-compra (oferta 1-clic tras el pago, ReConvert).
-- Lo rellenan el webhook orders/create|updated y el cron shopify-sync
-- detectando líneas con descuento manual de changeset (no promo codes).
alter table public.orders add column if not exists upsell_revenue numeric not null default 0;
comment on column public.orders.upsell_revenue is 'Importe pagado por líneas añadidas en el upsell post-compra (descuento manual de changeset, p. ej. ReConvert)';
