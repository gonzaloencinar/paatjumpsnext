-- Blog: gestor de contenidos del CRM (/admin/blog) + blog público (/blog).
-- Contenido en markdown; publicación programada = status 'published' con
-- published_at en el futuro (el blog público solo muestra published_at <= now()).
-- Aplicada en remoto vía MCP el 2026-07-03.

create table public.blog_posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null,
  excerpt          text,
  content_md       text not null default '',
  cover_image_url  text,
  seo_title        text,
  seo_description  text,
  keywords         text,
  status           text not null default 'draft'
                     check (status in ('draft', 'published')),
  published_at     timestamptz,
  author           text not null default 'Patri',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- El listado público filtra por estado y ordena por fecha de publicación.
create index blog_posts_published_idx
  on public.blog_posts (status, published_at desc);

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

alter table public.blog_posts enable row level security;
create policy "Admins manage blog posts" on public.blog_posts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, insert, update, delete on public.blog_posts to authenticated;
