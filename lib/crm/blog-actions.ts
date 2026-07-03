"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { BLOG_TAG } from "@/lib/blog/queries";
import { madridLocalToUtc } from "@/lib/crm/schedule";
import { requireAdmin, type ActionState } from "./actions";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type ParsedPost = {
  title: string;
  slug: string;
  excerpt: string | null;
  content_md: string;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  keywords: string | null;
  status: "draft" | "published";
  published_at: string | null;
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
  let published_at: string | null = null;
  if (publishedLocal) {
    const when = madridLocalToUtc(publishedLocal);
    if (!when) return { error: "La fecha de publicación no es válida." };
    published_at = when.toISOString();
  } else if (status === "published") {
    published_at = new Date().toISOString();
  }

  const optional = (name: string) =>
    String(formData.get(name) ?? "").trim() || null;

  return {
    title,
    slug,
    excerpt: optional("excerpt"),
    content_md: String(formData.get("content_md") ?? ""),
    cover_image_url: optional("cover_image_url"),
    seo_title: optional("seo_title"),
    seo_description: optional("seo_description"),
    keywords: optional("keywords"),
    status,
    published_at,
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
  const supabase = await requireAdmin();
  const fields = await parseForm(formData);
  if ("error" in fields) return fields;

  const { data, error } = await supabase
    .from("blog_posts")
    .insert(fields)
    .select("id")
    .single();
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe una entrada con ese slug."
          : "No se pudo crear la entrada.",
    };
  }

  refreshBlog();
  redirect(`/admin/blog/${data.id}`);
}

export async function updateBlogPost(
  postId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await requireAdmin();
  const fields = await parseForm(formData);
  if ("error" in fields) return fields;

  const { error } = await supabase
    .from("blog_posts")
    .update(fields)
    .eq("id", postId);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe una entrada con ese slug."
          : "No se pudo guardar la entrada.",
    };
  }

  refreshBlog(postId);
  return { ok: true };
}

export async function deleteBlogPost(postId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("blog_posts").delete().eq("id", postId);
  if (error) throw error;
  refreshBlog();
}
