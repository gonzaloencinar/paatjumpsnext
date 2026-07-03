import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const BLOG_TAG = "blog";

// Lecturas públicas del blog (/blog). Van con la SECRET KEY porque el
// storefront no tiene sesión de Supabase; el filtro published + fecha pasada
// es lo que mantiene los borradores y lo programado fuera de la web. La cache
// con tag hace de publicador: al llegar published_at, el siguiente refresh
// ("minutes") saca el post sin necesidad de cron, y el CRM fuerza
// updateTag(BLOG_TAG) al guardar.

const LIST_COLUMNS =
  "slug, title, excerpt, cover_image_url, published_at, updated_at";

export async function getPublishedPosts() {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("blog_posts")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });
  return data ?? [];
}

export async function getPublishedPost(slug: string) {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  return data;
}
