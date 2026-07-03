-- Asigna atómicamente un código libre del pool a un contacto (plan §8).
-- Aplicada en remoto vía MCP el 2026-07-02.
-- FOR UPDATE SKIP LOCKED: dos altas simultáneas nunca reciben el mismo código.
create or replace function public.assign_discount_code(p_contact_id uuid)
returns table (code text, expires_at timestamptz)
language sql
set search_path = ''
as $$
  update public.discount_codes dc
  set contact_id = p_contact_id
  where dc.id = (
    select id from public.discount_codes
    where contact_id is null
    order by created_at
    limit 1
    for update skip locked
  )
  returning dc.code, dc.expires_at;
$$;

-- Solo el backend (secret key) puede llamarla; ni anon ni authenticated.
revoke execute on function public.assign_discount_code(uuid) from public, anon, authenticated;
grant execute on function public.assign_discount_code(uuid) to service_role;
