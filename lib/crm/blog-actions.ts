"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { BLOG_TAG } from "@/lib/blog/queries";
import { convexMutation } from "@/lib/convex/server";
import { madridLocalToUtc } from "@/lib/crm/schedule";
import { requireAdmin, type ActionState } from "./actions";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type ParsedPost = {
  title: string;
  slug: string;
  excerpt: string | undefined;
  contentMd: string;
  coverImageUrl: string | undefined;
  seoTitle: string | undefined;
  seoDescription: string | undefined;
  keywords: string | undefined;
  status: "draft" | "published";
  publishedAt: number | undefined;
};

async function parseForm(
  formData: FormData,
): Promise<ParsedPost | { error: string }> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "La entrada necesita un título." };

  const rawSlug = String(formData.get("slug") ?? "").trim();
  const slug = rawSlug ? rawSlug.toLowerCase() : slugify(title);
  if (!SLUG_RE.test(slug)) {
    return { error: "Slug no válido: solo minúsculas, números y guiones." };
  }

  const status = formData.get("status") === "published" ? "published" : "draft";

  // datetime-local en hora de Madrid → UTC. Fecha futura = programada.
  const publishedLocal = String(formData.get("published_local") ?? "").trim();
  let publishedAt: number | undefined;
  if (publishedLocal) {
    const when = madridLocalToUtc(publishedLocal);
    if (!when) return { error: "La fecha de publicación no es válida." };
    publishedAt = when.getTime();
  } else if (status === "published") {
    publishedAt = Date.now();
  }

  const optional = (name: string) =>
    String(formData.get(name) ?? "").trim() || undefined;

  return {
    title,
    slug,
    excerpt: optional("excerpt"),
    contentMd: String(formData.get("content_md") ?? ""),
    coverImageUrl: optional("cover_image_url"),
    seoTitle: optional("seo_title"),
    seoDescription: optional("seo_description"),
    keywords: optional("keywords"),
    status,
    publishedAt,
  };
}

function refreshBlog(id?: string) {
  updateTag(BLOG_TAG);
  revalidatePath("/admin/blog");
  if (id) revalidatePath(`/admin/blog/${id}`);
}

export async function createBlogPost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const fields = await parseForm(formData);
  if ("error" in fields) return fields;

  const result = await convexMutation(api.blog.create, fields);
  if (result.error || !result.id) {
    return { error: result.error ?? "No se pudo crear la entrada." };
  }

  refreshBlog();
  redirect(`/admin/blog/${result.id}`);
}

export async function updateBlogPost(
  postId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const fields = await parseForm(formData);
  if ("error" in fields) return fields;

  const result = await convexMutation(api.blog.update, {
    id: postId,
    ...fields,
  });
  if (result.error) return { error: result.error };

  refreshBlog(postId);
  return { ok: true };
}

export async function deleteBlogPost(postId: string) {
  await requireAdmin();
  const result = await convexMutation(api.blog.remove, { id: postId });
  if (result.error) throw new Error(result.error);
  refreshBlog();
}
