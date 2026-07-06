-- Espejo de la migración aplicada vía MCP el 2026-07-06 (drop_finance_month_close).
-- El cierre de mes por envíos se retiró el mismo día: el coste real sin IVA
-- llega ahora del sync de Packlink (packlink_shipments) y entra directo como
-- gasto automático de Gonzalo. La tabla nunca llegó a tener filas.
drop table if exists public.finance_month_close;
