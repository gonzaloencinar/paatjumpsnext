-- Fixes de advisors tras crm_initial (aplicada en remoto vía MCP el 2026-07-02)

-- 1) rls_auto_enable() (helper de plantilla del proyecto, SECURITY DEFINER):
--    no debe ser invocable vía RPC por anon/authenticated.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2) Policy de admin_users: envolver toda la expresión auth en un scalar subquery
--    para que se evalúe una vez por statement (initplan), no por fila.
drop policy "Own admin row" on public.admin_users;
create policy "Own admin row" on public.admin_users
  for select to authenticated
  using (email = (select lower(coalesce(auth.jwt() ->> 'email', ''))));

-- 3) is_admin(): misma forma initplan-friendly.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where email = (select lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;
