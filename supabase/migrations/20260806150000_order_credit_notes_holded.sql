-- Rectificativas (credit notes / abonos) en Holded por devolución de Shopify.
-- Una fila por refund de Shopify (un pedido puede tener varias devoluciones
-- parciales). Mismo patrón que order_invoices: claim idempotente, RLS admin.

create table public.order_credit_notes (
  refund_id text primary key,
  order_id bigint not null,
  holded_id text,
  document_number text,
  -- pending | created | skipped | error (ver order_invoices)
  status text not null default 'pending',
  error text,
  total numeric,
  tax numeric,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_credit_notes_order_id_idx
  on public.order_credit_notes (order_id);

alter table public.order_credit_notes enable row level security;

create policy "order_credit_notes admin" on public.order_credit_notes
  for all using ((select public.is_admin()))
  with check ((select public.is_admin()));
