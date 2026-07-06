-- Espejo de la migración aplicada vía MCP el 2026-07-06 (finance_entries_deleted_at).
-- Tombstone para entradas generadas por un recurrente: al "borrar" una se
-- marca deleted_at (la fila conserva el unique recurring_id+period y la
-- materialización no la recrea). Las entradas manuales se borran de verdad.
alter table public.finance_entries
  add column if not exists deleted_at timestamptz;
