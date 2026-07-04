-- Espejo de la migración aplicada vía MCP el 2026-07-04 (short_links).
-- Acortador de enlaces del CRM: /l/<slug> redirige al destino con los UTMs
-- del enlace. Gestión en /admin/links; el route handler usa service role.
create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  destination text not null default '/',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  notes text,
  clicks integer not null default 0,
  last_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint short_links_slug_format check (slug ~ '^[a-z0-9-]{1,40}$')
);
alter table public.short_links enable row level security;
create policy "Admins manage short_links" on public.short_links
  for all using ((select is_admin())) with check ((select is_admin()));

-- Redirección en un solo roundtrip: suma el clic y devuelve destino + UTMs.
-- Solo para el route handler (service role); sin EXECUTE para anon/authenticated.
create or replace function public.register_link_click(p_slug text)
returns table (
  destination text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text
)
language sql
security definer
set search_path = public
as $$
  update public.short_links sl
     set clicks = sl.clicks + 1,
         last_clicked_at = now()
   where sl.slug = p_slug
  returning sl.destination, sl.utm_source, sl.utm_medium, sl.utm_campaign,
            sl.utm_term, sl.utm_content;
$$;
revoke execute on function public.register_link_click(text) from anon, authenticated;

-- Enlaces iniciales de Instagram
insert into public.short_links (slug, destination, utm_source, utm_medium, utm_campaign, notes)
values
  ('bio', '/', 'instagram', 'social', 'bio', 'Biografía de Instagram'),
  ('story', '/', 'instagram', 'social', 'story', 'Stories genéricas de Instagram')
on conflict (slug) do nothing;
