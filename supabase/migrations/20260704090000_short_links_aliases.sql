-- Espejo de la migración aplicada vía MCP el 2026-07-04 (short_links_aliases).
-- Aliases de enlaces cortos: al renombrar un slug, el antiguo queda como
-- alias del mismo enlace — redirige igual y suma el clic al canónico, sin
-- aparecer como fila propia. Los gestiona saveShortLink automáticamente.
alter table public.short_links
  add column if not exists aliases text[] not null default '{}';

-- El slug exacto gana; si no, primer alias que coincida. Una sola fila.
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
  with target as (
    select id from public.short_links where slug = p_slug
    union all
    select id from public.short_links
     where p_slug = any(aliases)
       and not exists (select 1 from public.short_links where slug = p_slug)
    limit 1
  )
  update public.short_links sl
     set clicks = sl.clicks + 1,
         last_clicked_at = now()
    from target
   where sl.id = target.id
  returning sl.destination, sl.utm_source, sl.utm_medium, sl.utm_campaign,
            sl.utm_term, sl.utm_content;
$$;
revoke execute on function public.register_link_click(text) from anon, authenticated;

-- Fusión del legacy /l/story en /l/stories hecha en remoto (clics sumados,
-- fila 'story' eliminada, alias 'story' en 'stories').
