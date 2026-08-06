import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { api } from "@/convex/_generated/api";
import { convexQuery, msToIso } from "@/lib/convex/server";
import type { Doc } from "@/convex/_generated/dataModel";

export const BLOG_TAG = "blog";

// Lecturas públicas del blog (/blog). El filtro published + fecha pasada es lo
// que mantiene los borradores y lo programado fuera de la web. La cache con
// tag hace de publicador: al llegar published_at, el siguiente refresh
// ("minutes") saca el post sin necesidad de cron, y el CRM fuerza
// updateTag(BLOG_TAG) al guardar.

// Forma legacy (snake_case, ISO) que esperan páginas, sitemap y JSON-LD
function toLegacy(doc: Doc<"blog_posts">) {
  return {
    id: doc._id,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt ?? null,
    content_md: doc.contentMd,
    cover_image_url: doc.coverImageUrl ?? null,
    seo_title: doc.seoTitle ?? null,
    seo_description: doc.seoDescription ?? null,
    keywords: doc.keywords ?? null,
    status: doc.status,
    author: doc.author,
    published_at: msToIso(doc.publishedAt),
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

export async function getPublishedPosts() {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife("minutes");

  const posts = await convexQuery(api.blog.published, { now: Date.now() });
  return posts.map(toLegacy);
}

export async function getPublishedPost(slug: string) {
  "use cache";
  cacheTag(BLOG_TAG);
  cacheLife("minutes");

  const post = await convexQuery(api.blog.publishedBySlug, {
    slug,
    now: Date.now(),
  });
  return post ? toLegacy(post) : null;
}
