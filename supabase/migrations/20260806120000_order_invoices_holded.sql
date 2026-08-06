-- Estado de facturación en Holded por pedido (tickets de venta / sales receipts).
-- Una fila por pedido de Shopify facturado (o intentado). Patrón de
-- order_dni_requests: PK = id numérico del pedido, RLS solo admin (los crons
-- y el backfill escriben con el cliente service-role).

create table public.order_invoices (
  order_id bigint primary key,
  order_name text,
  holded_id text,
  document_number text,
  -- pending: fila reclamada, aún sin crear en Holded
  -- created: ticket creado y aprobado en Holded
  -- skipped: no se factura (devolución, cancelado, total 0…); ver error
  -- error: fallo al crear/aprobar; ver error y attempts
  status text not null default 'pending',
  error text,
  total numeric,
  tax numeric,
  emailed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_invoices enable row level security;

create policy "order_invoices admin" on public.order_invoices
  for all using ((select public.is_admin()))
  with check ((select public.is_admin()));
