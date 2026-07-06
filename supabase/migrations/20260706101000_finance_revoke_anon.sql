-- Espejo de la migración aplicada vía MCP el 2026-07-06 (finance_revoke_anon).
-- Convención del proyecto (crm_initial): anon sin grants en tablas del CRM.
revoke all on public.finance_entries from anon;
revoke all on public.finance_recurring from anon;
revoke all on public.finance_settings from anon;
